import { cosineSimilarity, createDropdownButton, embedGemini, euclideanDistance, hookDropdownButton, getTCGAStudy, getTCGAURL, getImageInfo, getTile, imageTransforms } from "./helper.js";
import { State } from "./State.js";
import { Tabulator, SelectRowModule } from 'https://cdn.jsdelivr.net/npm/tabulator-tables@6.2.1/+esm';
import jszip from "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import * as onnxRuntime from "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/esm/ort.min.js";

// import { WebFed } from "http:/localhost:5501/webFed_yjs.js"
let signalingServer = "https://signalyjs-df59a68bd6e6.herokuapp.com"
const FEDERATION_NAME = "FESE"
const selfName = window.crypto.randomUUID()

Tabulator.registerModule([SelectRowModule])

const EXAMPLE_DATA = [
  { id: "wsi_patches", path: "https://prafulb.github.io/fese/data/wsiPatchEmbeddingsTSNE.json", colorBy: "tcgaClass"},
  { id: "tcga_reports", path: "/ese/data/tcga_reports_tsne.json.zip", colorBy: "cancer_type"},
  // { id: "tcga_reports_verbose", path: "/ese/data/tcga_reports_verbose.json.zip", colorBy: "cancer_type" },
  { id: "tcga_reports_verbose", path: "/ese/data/tcga_reports_verbose_tsne.json.zip", colorBy: "cancer_type" },
  { id: "soc_codes", path: "/ese/data/soc_code_jobs_tsne.json.zip" }
]

const CONSTANTS = {
  DEFAULT_STATE: {
    dataConfig: EXAMPLE_DATA[0]
  }
}

class Application {
  constructor() {
    this.init();
  }

  async init() {
    this.url = new URL(window.location.href);

    this.elems = this.elementRetrieval({
      content: "#content",
      loading: "#loading",
      explorerContainer: "#gr-container-explorer",
      closestContainer: "#gr-container-closest",
      closestTableContainer: "#closest-table-container",
      referenceDocumentContainer: "#reference-document-container",
      comparedDocumentContainer: "#compared-document-container",
      // searchForm: "#search-form",
      // searchInput: "#search-input",
      patchEmbed: "#patchEmbed",
      patchEmbedModal: "#patchEmbedModal",
      // buttonFill: "#button-fill"
      buttonEmbed: "#button-embed",
      buttonLoadPCA: "#buttonLoadPCA",
      buttonLoadTSNE: "#buttonLoadTSNE"
    })

    this.initState();
    this.hookInputs();

    let resizeTimeout;
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }

      this.elems.explorerContainer.innerHTML = '';
      resizeTimeout = setTimeout(() => {
        this.drawExplorer();
      }, 100);

      // Kind of hack-y
      this.elems.closestTableContainer.innerHTML = '';
      resizeTimeout = setTimeout(() => {
        const containerWidth = this.elems.closestContainer.getBoundingClientRect().width;
        if (containerWidth > 0) {
          this.elems.closestTableContainer.style.width = (containerWidth-35) + "px";
        }
        this.drawTable();
      }, 100);
      
    });
    resizeObserver.observe(this.elems.content);

    // this.webFed = new WebFed({
    //   signalingServer,
    //   'federationName': FEDERATION_NAME,
    //   selfName
    // })
    // console.log(this.webFed)
    // document.addEventListener("webFed_synced", (event) =>{
    //   if (event.detail.synced) {
    //     const allPeers = this.webFed.getAllPeers()
    //     allPeers.forEach(peer => {
    //       if (!peer.isSelf)
    //         console.log(`Connected to peer ${peer.name}`)
    //     })
    //   }
    // })  
    // document.addEventListener("defaultMessage", (e) => {
    //   console.log("HERE")
    //   console.log(e)
    // })
    this.state.trigger("dataConfig");
  }

  initState() {
    const initialState = CONSTANTS.DEFAULT_STATE;

    if (this.url.searchParams.has("example_data")) {
      initialState.dataConfig = EXAMPLE_DATA.find(d => d.id == this.url.searchParams.get("example_data"));
    }
    
    this.state = new State();
    this.state.defineProperty("dataConfig", initialState.dataConfig);   
    this.state.subscribe("dataConfig", () => this.dataConfigUpdated());

    this.state.defineProperty("focusDocument", null);
    this.state.subscribe("focusDocument", () => this.focusDocumentUpdated());
    this.state.defineProperty("compareDocument", null);
    this.state.subscribe("compareDocument", () => this.compareDocumentUpdated());

    // this.state.defineProperty("measure", { f: euclideanDistance, type: "distance" });
    this.state.defineProperty("measure", { f: cosineSimilarity, type: "similarity" });

    this.state.defineProperty("colorBy", initialState.dataConfig.colorBy);
    this.state.defineProperty("colorByOptions", []);

    this.state.subscribe("colorBy",  () => this.compareDocumentUpdated());
  }

  hookInputs() {
    // this.elems.searchForm.addEventListener("submit", (e) => {
    //   e.preventDefault();

    //   if (!localStorage.GEMINI_API_KEY) {
    //     localStorage.GEMINI_API_KEY = prompt("A Gemini API key is required to use semantic search. Enter your's here:");
    //   }

    //   embedGemini(this.elems.searchInput.value, localStorage.GEMINI_API_KEY).then((result) => {
    //     this.state.focusDocument = { 
    //       text: this.elems.searchInput.value, 
    //       embedding: result.embedding.values,
    //     };
    //   });
    // })

    ["tileX", "tileY", "tileWidth", "tileHeight"].forEach(elId => {
      const element = document.getElementById(elId)
      element.oninput = async (e) => {
        element.previousElementSibling.innerText = e.target.value
      }
    })

    const patchPreview = (url) => {
      document.getElementById('patchPreview').src = url
      document.getElementById('patchPreview').onload = () => {
        document.getElementById('patchPreview').style.display="block"
        document.getElementById('patchPreview').previousElementSibling.style.display = "none"
      }
    }

    const getTileParams = () => {
      const formInputFields = ["wsiURL", "tileX", "tileY", "tileWidth", "tileHeight", "tileResolution"]
      const tileParams = {}
      tileParams[formInputFields[1]] = parseInt(document.getElementById(formInputFields[1]).value)
      tileParams[formInputFields[2]] = parseInt(document.getElementById(formInputFields[2]).value)
      tileParams[formInputFields[3]] = parseInt(document.getElementById(formInputFields[3]).value)
      tileParams[formInputFields[4]] = parseInt(document.getElementById(formInputFields[4]).value)
      tileParams[formInputFields[5]] = parseInt(document.getElementById(formInputFields[5]).value)
      return tileParams
    }

    const embedPatch = async (objectURL, patchSize) => {
      if (!this.state.embeddingModel) {
        onnxRuntime.env.wasm.wasmPaths =
            "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/";
        this.state.embeddingModel = await onnxRuntime.InferenceSession.create(
            "https://huggingface.co/prafulb/phikon-onnx/resolve/main/model.onnx"
          );
      }

      const canvas = new OffscreenCanvas(patchSize, patchSize);
      const ctx = canvas.getContext("2d");
      
      const imageTensor = await new Promise((resolve) => {
          const tempImg = new Image();
          tempImg.src = objectURL;
          tempImg.crossOrigin = "anonymous";
          tempImg.onload = () => {
              ctx.drawImage(tempImg, 0, 0);
              const pixelArray = Array.from(
              ctx
                .getImageData(0, 0, patchSize, patchSize)
                .data.filter((v, i) => i % 4 !== 3)
              );
              
              resolve(new onnxRuntime.Tensor("float32", imageTransforms(pixelArray), [1, 3, 224, 224]));
          };
      })
      const { embedding: { cpuData } } = await this.state.embeddingModel.run({ image: imageTensor });
      return Array.from(cpuData)
    }

    const formInputFields = ["wsiURL", "tileX", "tileY", "tileWidth", "tileHeight", "tileResolution"]
    formInputFields.forEach(elId => {
      const element = document.getElementById(elId)
      element.onchange = async (e) => {
        document.getElementById('patchPreview').style.display = "none"
        document.getElementById('patchPreview').previousElementSibling.style.display = "block"
        const wsiURL = document.getElementById(formInputFields[0]).value
        if (e.target.id === "wsiURL") {
          const imageInfo = await getImageInfo(wsiURL)
          if (imageInfo) {
            document.getElementById(formInputFields[1]).max = imageInfo.width - 256
            document.getElementById(formInputFields[2]).max = imageInfo.height - 256
          }
        }
        const tileParams = getTileParams()
        
        const tileURL = await getTile(wsiURL, tileParams)
        patchPreview(tileURL)
      }
    })
    
    this.elems.patchEmbed.addEventListener("click", async (e) => {
      if (document.getElementById('patchPreview').src) {
        this.elems.patchEmbed.classList.remove("d-block")
        this.elems.patchEmbed.classList.add("d-none")
        this.elems.patchEmbed.nextElementSibling.classList.remove("d-none")
        this.elems.patchEmbed.nextElementSibling.classList.add("d-block")
        const embedding = await embedPatch(document.getElementById('patchPreview').src, document.getElementById(formInputFields[5]).value)
        const tcgaWSIURL = getTCGAURL(document.getElementById(formInputFields[0]).value)
        this.data.push({
          tcgaWSIURL,
          "tileParams": getTileParams(),
          "properties": {
            "tcgaClass": await getTCGAStudy(getTCGAURL(tcgaWSIURL).split("/").slice(-1)[0]) || "Unknown"
          },
          "_index": this.data.length,
          embedding,
          'embedding3d': embedding.slice(0,3)
        })

        // this.webFed.broadcastMessage({
        //   'type': "newPatchEmbedding",
        //   'from': this.webFed.selfName,
        //   'acknowledged': [this.webFed.selfName]
        // })

        this.elems.patchEmbed.nextElementSibling.classList.remove("d-block")
        this.elems.patchEmbed.nextElementSibling.classList.add("d-none")
        this.elems.patchEmbed.classList.remove("d-none");
        this.elems.patchEmbed.classList.add("d-block");

        document.getElementById("closePatchEmbedModal").click()
        this.dataConfigUpdated()
        this.state.focusDocument = this.data[this.data.length - 1]

      }
    })

    // hookDropdownButton(this.elems.buttonFill, this.state, "colorBy", "colorByOptions");

    // createDropdownButton(this.elems.buttonFill, [
    //   { text: "patient_id", callback: d => d}
    // ], { header: "Fill Points By"})
  }

  async dataConfigUpdated() {
    if (!this.data && this.state.dataConfig.path) {
      if (this.state.dataConfig.path.endsWith(".zip")) {
        let data = await (await fetch(this.state.dataConfig.path)).blob();
        const zip = new jszip();
        await zip.loadAsync(data);
        const filename = this.state.dataConfig.path.split("/").at(-1).replace(".zip", "");
        data = await (await zip.file(filename)).async("string");
        data = JSON.parse(data);
        this.data = data;
        this.data.forEach((doc, i) => doc._index = i);
        this.state.focusDocument = this.data[0];
        this.state.colorByOptions = [...Object.keys(this.data[0].properties)];
        
        this.elems.loading.style.display = "none";
        this.elems.content.style.display = "block";
      } else {
        this.data = await (await fetch(this.state.dataConfig.path)).json();
        this.data.forEach((doc, i) => doc._index = i);
        this.state.focusDocument = this.data[0];
        this.state.colorByOptions = [...Object.keys(this.data[0].properties)];
        this.elems.loading.style.display = "none";
        this.elems.content.style.display = "block";
      }
    
    } else {
      this.state.colorByOptions = [...Object.keys(this.data[0].properties)];
      this.elems.loading.style.display = "none";
      this.elems.content.style.display = "block";
    }
    this.drawExplorer();
  }

  async focusDocumentUpdated() {
    this.drawUpdateExplorer();

    const measures = this.data.map(d => this.state.measure.f(d.embedding, this.state.focusDocument.embedding));
    this.data.forEach((doc,i) => doc._measure = measures[i]);
    this.drawTable();
    getTile(this.state.focusDocument.tcgaWSIURL, this.state.focusDocument.tileParams).then(tileURL => {
      this.elems.referenceDocumentContainer.innerHTML = `<img src=${tileURL}><p>Class: ${this.state.focusDocument.properties.tcgaClass}`
    })
    this.elems.referenceDocumentContainer.innerHTML = `<p>Loading Patch...</p>`
  }

  async compareDocumentUpdated() {
    const compareDocument = this.state.compareDocument[0];
    getTile(compareDocument.tcgaWSIURL, compareDocument.tileParams).then(tileURL => {
      this.elems.comparedDocumentContainer.innerHTML = `<img src=${tileURL}><p>Class: ${compareDocument.properties.tcgaClass}`
    })
    this.elems.comparedDocumentContainer.innerHTML = `<p>Loading Patch...</p>`
    this.drawUpdateExplorer();
  }

  drawUpdateExplorer() {

    let colors = this.data.map(() => "grey");
    const sizes = this.data.map(() => 5);

    if (this.state.compareDocument) {
      this.state.compareDocument.forEach(doc => colors[doc._index] = "blue");
      this.state.compareDocument.forEach(doc => sizes[doc._index] = 10);
    }
    if (this.state.focusDocument) {
      colors[this.state.focusDocument._index] = "green";
      sizes[this.state.focusDocument._index] = 15;
    }

    const colorMap = new Map();
    const colorRange = d3.schemeCategory10;
    const values = [...new Set(this.data.map(d => d.properties[this.state.colorBy]))];
    values.forEach((value, i) => colorMap.set(value, colorRange[i % colorRange.length]));
    // colors = this.data.map(d => d._measure);
    colors = this.data.map(d => colorMap.get(d.properties[this.state.colorBy]));

    const update = {
      marker: { 
        color: colors,
        size: sizes,
        // colorscale: "Blues",
      }
    };
    // setTimeout is a workaround for a Plotly bug (https://github.com/plotly/plotly.js/issues/1025)
    setTimeout(() => Plotly.restyle(this.elems.explorerContainer, update, [0]), 50);
  }

  drawExplorer() {
    if (!this.data) return;

    const pointTrace = {
      x: this.data.map(d => d.embedding3d[0]),
      y: this.data.map(d => d.embedding3d[1]),
      z: this.data.map(d => d.embedding3d[2]),
      mode: "markers",
      marker: {
        size: this.data.map(() => 5),
        color: this.data.map(() => "grey"),
      },
      type: 'scatter3d'
    };

    const layout = {
      margin: {
        l: 0,
        r: 0,
        b: 0,
        t: 0
      }
    };

    Plotly.newPlot(this.elems.explorerContainer, [pointTrace], layout);

    this.elems.explorerContainer.on("plotly_click", (data) => {
      const point = data.points[0];
      this.state.focusDocument = this.data[point.pointNumber];
      // console.log(this.data[point.pointNumber]);
    });

    this.drawUpdateExplorer();
  }

  drawTable() {

    if (!this.data) return;

    const measureType = this.state.measure.type;

    const tableData = this.data
      .map(doc => ({
        ...doc.properties,
        [measureType]: parseFloat(doc._measure.toFixed(3)),
        _doc: doc,
        _id: doc.tcgaWSIURL,
      }));

    if (measureType == "distance") {
      tableData.sort((a,b) => a.distance - b.distance);
    } else {
      tableData.sort((a,b) => b.similarity - a.similarity);
    }

    const columns = [...Object.keys(tableData[0])].filter(d => !d.startsWith("_")).map(d => ({field: d, title: d}));

    const table = new Tabulator(this.elems.closestTableContainer, {
      data: tableData, 
      // height: bbox.height,
      layout:"fitDataFill",
      selectableRows: true,
      selectableRowsRangeMode:"click",
      columns,
      index: "_id",
    });

    table.on("tableBuilt", () => table.selectRow([tableData[0]._id]));

    table.on("rowSelectionChanged", (data, rows, selected) => {
      const compareDocuments = [];
      for (const row of selected) {
        compareDocuments.push( row._row.data._doc);
      }
      this.state.compareDocument = compareDocuments;
    })
  }

  elementRetrieval(elements) {
    for (const [k,v] of Object.entries(elements)){
      elements[k] = document.querySelector(v);
    }
    return elements;
  }
}

new Application() 