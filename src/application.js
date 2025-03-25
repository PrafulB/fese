import { cosineSimilarity, createDropdownButton, embedGemini, euclideanDistance, hookDropdownButton, getTCGAStudy, getTCGAURL, getGCSURL, getImageInfo, getTile, samplePatchesAndEmbedSlide, imageTransforms } from "./helper.js";
import { State } from "./State.js";
import { Tabulator, SelectRowModule } from 'https://cdn.jsdelivr.net/npm/tabulator-tables@6.2.1/+esm';
import jszip from "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import * as onnxRuntime from "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/esm/ort.min.js";

import { WebFed } from "https:/episphere.github.io/lab/webFed_yjs.js"
let signalingServer = "https://signalyjs-df59a68bd6e6.herokuapp.com"
const FEDERATION_NAME = "FESE"
const selfName = window.crypto.randomUUID()
const supportedModelsPath = "https://prafulb.github.io/fese/models/supportedModels.json"

Tabulator.registerModule([SelectRowModule])

const EXAMPLE_DATA = [
  { id: "wsi_slides", path: "https://prafulb.github.io/fese/data/tcgaSlideEmbeddingsTSNE4Classes.json", colorBy: "Primary Site"},
  { id: "tcga_reports", path: "https://prafulb.github.io/fese/data/tcga_reports_tsne.json.zip", colorBy: "cancer_type"},
  { id: "gleason_slides", path: "https://prafulb.github.io/fese/data/tcgaGleasonSlideEmbeddingsTSNE.json", colorBy: "gleason_score"},
  { id: "gleason_patches", path: "https://prafulb.github.io/fese/data/wsiGleasonPatchEmbeddingsTSNE.json", colorBy: "gleason_score"},
  // { id: "tcga_reports_verbose", path: "/ese/data/tcga_reports_verbose.json.zip", colorBy: "cancer_type" },
  { id: "tcga_reports_verbose", path: "/ese/data/tcga_reports_verbose_tsne.json.zip", colorBy: "cancer_type" },
  { id: "soc_codes", path: "/ese/data/soc_code_jobs_tsne.json.zip" }
]

const SUPPORTED_MODELS = [
  {
      "modelId": 0,
      "modelName": "CTransPath",
      "modelURL": "https://huggingface.co/kaczmarj/CTransPath/resolve/main/model.onnx",
      "multimodal": false,
      "defaultNumPatches": 50,
      "enabled": true
  },
  {
      "modelId": 1,
      "modelName": "Phikon",
      "modelURL": "https://huggingface.co/prafulb/phikon-onnx/resolve/main/model.onnx",
      "multimodal": false,
      "defaultNumPatches": 50,
      "enabled": true
  },
  {
      "modelId": 2,
      "modelName": "PLIP",
      "modelURL": "https://huggingface.co/prafulb/plip-onnx/resolve/main/model.onnx",
      "multimodal": true,
      "defaultNumPatches": 1,
      "enabled": true
  },
  {
      "modelId": 3,
      "modelName": "CONCH",
      "modelURL": "https://huggingface.co/MahmoodLab/CONCH",
      "multimodal": true,
      "enabled": false
  }
]

const CONSTANTS = {
  DEFAULT_STATE: {
    dataConfig: EXAMPLE_DATA[0],
    selectedModel: SUPPORTED_MODELS[0]
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
      selectModel: "#selectModel",
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

    this.webFed = new WebFed({
      signalingServer,
      'federationName': FEDERATION_NAME,
      selfName
    })
    console.log(this.webFed)
    document.addEventListener("webFed_synced", (event) =>{
      if (event.detail.synced) {
        const allPeers = this.webFed.getAllPeers()
        allPeers.forEach(peer => {
          if (!peer.isSelf)
            console.log(`Connected to peer ${peer.name}`)
        })
      }
    })  
    document.addEventListener("webFed_defaultMessage", (e) => {
      console.log("Embedding received", e)
      this.data.push(e.detail.data)
      this.dataConfigUpdated()
      this.state.focusDocument = this.data[this.data.length - 1]
    })
    this.state.trigger("dataConfig");
    // this.state.trigger("selectedModel");
  }

  initState() {
    const initialState = CONSTANTS.DEFAULT_STATE;

    if (this.url.searchParams.has("id")) {
      initialState.dataConfig = EXAMPLE_DATA.find(d => d.id == this.url.searchParams.get("id"));
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
    
    
    this.state.defineProperty("selectedModel", initialState.selectedModel);
    this.state.subscribe("selectedModel", () => this.modelSelectionUpdated());
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

    // ["tileX", "tileY", "tileWidth", "tileHeight"].forEach(elId => {
    //   const element = document.getElementById(elId)
    //   element.oninput = async (e) => {
    //     element.previousElementSibling.innerText = e.target.value
    //   }
    // })

    const patchPreview = (url) => {
      document.getElementById('patchPreview').src = url
      document.getElementById('patchPreview').onload = () => {
        document.getElementById('patchPreview').style.display="block"
        document.getElementById('patchPreview').previousElementSibling.style.display = "none"
      }
    }

    // const getTileParams = () => {
    //   const formInputFields = ["wsiURL", "tileX", "tileY", "tileWidth", "tileHeight", "tileResolution"]
    //   // const tileParams = {}
    //   // tileParams[formInputFields[1]] = parseInt(document.getElementById(formInputFields[1]).value)
    //   // tileParams[formInputFields[2]] = parseInt(document.getElementById(formInputFields[2]).value)
    //   // tileParams[formInputFields[3]] = parseInt(document.getElementById(formInputFields[3]).value)
    //   // tileParams[formInputFields[4]] = parseInt(document.getElementById(formInputFields[4]).value)
    //   // tileParams[formInputFields[5]] = parseInt(document.getElementById(formInputFields[5]).value)
    //   // return tileParams
    // }

    const embedSlide = async (slideURL, numPatches, encoderModelURL) => {
      if (!this.state.embeddingModel) {
        onnxRuntime.env.wasm.wasmPaths =
            "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/";
        this.state.embeddingModel = await onnxRuntime.InferenceSession.create(encoderModelURL);
      }

      const slideEmbeddings = await samplePatchesAndEmbedSlide(slideURL, numPatches, this.state.embeddingModel)
      return slideEmbeddings
    }

    const formInputFields = ["wsiURL", "numPatches", "encoderModel", "imageLabel"]
    document.getElementById(formInputFields[0]).onchange = async (e) => {
      document.getElementById('patchPreview').style.display = "none"
      document.getElementById('patchPreview').previousElementSibling.style.display = "block"
      const wsiURL = document.getElementById(formInputFields[0]).value
      // if (e.target.id === "wsiURL") {
      //   const imageInfo = await getImageInfo(wsiURL)
        // if (imageInfo) {
        //   document.getElementById(formInputFields[1]).max = imageInfo.width - 256
        //   document.getElementById(formInputFields[2]).max = imageInfo.height - 256
        // }
      // }
      // const tileParams = getTileParams()
      
      const tileURL = await getTile(wsiURL)
      patchPreview(tileURL)
    }
    
    this.elems.patchEmbed.addEventListener("click", async (e) => {
      if (!document.getElementById(formInputFields[3]).value) {
        alert("Please enter a value for the image label")
        return
      }
      if (document.getElementById('patchPreview').src) {
        this.elems.patchEmbed.classList.remove("d-block")
        this.elems.patchEmbed.classList.add("d-none")
        this.elems.patchEmbed.nextElementSibling.classList.remove("d-none")
        this.elems.patchEmbed.nextElementSibling.classList.add("d-block")
        const embedding = await embedSlide(document.getElementById(formInputFields[0]).value, document.getElementById(formInputFields[1]).value, document.getElementById(formInputFields[2]).value)
        // const tcgaWSIURL = getTCGAURL(document.getElementById(formInputFields[0]).value)
        const wsiURL = getTCGAURL(document.getElementById(formInputFields[0]).value)
        const imageLabel = isNaN(parseInt(document.getElementById(formInputFields[3]).value)) ? document.getElementById(formInputFields[3]).value : parseInt(document.getElementById(formInputFields[3]).value)
        const labelKey = this.state.colorBy
        const properties = {}
        properties[labelKey] = imageLabel
        const newEmbedding = {
          wsiURL,
          properties,
          "_index": this.data.length,
          embedding,
          'embedding3d': embedding.slice(0,3)
        }
        this.data.push(newEmbedding)

        this.webFed.broadcastMessage({
          'type': "newPatchEmbedding",
          'from': this.webFed.selfName,
          'data': newEmbedding,
          'acknowledged': [this.webFed.selfName]
        })

        this.elems.patchEmbed.nextElementSibling.classList.remove("d-block")
        this.elems.patchEmbed.nextElementSibling.classList.add("d-none")
        this.elems.patchEmbed.classList.remove("d-none");
        this.elems.patchEmbed.classList.add("d-block");

        document.getElementById("closeSlideEmbedModal").click()
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
    getTile(this.state.focusDocument.tcgaWSIURL || this.state.focusDocument.wsiURL, this.state.focusDocument.tileParams, 256).then(tileURL => {
      // getTile(this.state.focusDocument.gcsWSIURL, this.state.focusDocument.tileParams).then(tileURL => {
      const loadingTextElement = this.elems.referenceDocumentContainer.querySelector("p#loadingFocusDocPreviewText")
      if (loadingTextElement) {
        this.elems.referenceDocumentContainer.removeChild(loadingTextElement)
      }
      this.elems.referenceDocumentContainer.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="https://episphere.github.io/imagebox3/#wsiURL=${this.state.focusDocument.tcgaWSIURL || this.state.focusDocument.wsiURL}"><img src=${tileURL}></a><p>${this.state.colorBy}: ${this.state.focusDocument.properties[this.state.colorBy]}`
    })
    this.elems.referenceDocumentContainer.innerHTML = `<p id="loadingFocusDocPreviewText">Loading...</p>`
  }

  async compareDocumentUpdated() {
    const compareDocuments = this.state.compareDocument;
    this.elems.comparedDocumentContainer.innerHTML = ""
    compareDocuments.forEach(compareDocument => {
      const {tcgaWSIId, tileParams } = compareDocument
      let tileX, tileY, tileWidth, tileHeight
      if (tileParams) {
        tileX = tileParams.tileX
        tileY = tileParams.tileY
        tileWidth = tileParams.tileWidth
        tileHeight = tileParams.tileHeight
      }
      getTile(compareDocument.tcgaWSIURL || compareDocument.wsiURL, compareDocument.tileParams, 256).then(tileURL => {
      // getTile(compareDocument.gcsWSIURL, compareDocument.tileParams).then(tileURL => {
        const loadingTextElement = this.elems.comparedDocumentContainer.querySelector("p#loadingCompareDocPreviewText")
        if (loadingTextElement) {
          this.elems.comparedDocumentContainer.removeChild(loadingTextElement)
        }
        if (!this.elems.comparedDocumentContainer.querySelector(`img[tcgaWSIId="${tcgaWSIId}"][tileX="${tileX}"][tileY="${tileY}"][tileWidth="${tileWidth}"][tileHeight="${tileHeight}"]`)) {
          this.elems.comparedDocumentContainer.innerHTML += `<div><a target="_blank" rel="noopener noreferrer" href="https://episphere.github.io/imagebox3/#wsiURL=${compareDocument.tcgaWSIURL || compareDocument.wsiURL}"><img tcgaWSIId=${tcgaWSIId} tileX=${tileX} tileY=${tileY} tileWidth=${tileWidth} tileHeight=${tileHeight} src=${tileURL}></a><p>${this.state.colorBy}: ${compareDocument.properties[this.state.colorBy]}</div>`
        }
      })
    })
    this.elems.comparedDocumentContainer.innerHTML = `<p id="loadingCompareDocPreviewText">Loading...</p>`
    this.drawUpdateExplorer();
  }

  async modelSelectionUpdated() {
    if (!this.model && !this.supportedModels) {
      this.supportedModels = await (await fetch(supportedModelsPath)).json()
      this.supportedModels.forEach(model => {
        const optionElement = document.createElement("option")
        optionElement.innerText = model.modelName
        optionElement.value = model.modelURL
        optionElement.setAttribute("modelId", model.modelId)
        optionElement.setAttribute("disabled", !model.enabled)
        this.elems.selectModel.appendChild(optionElement)
      })
    }
    this.model = await loadModel(this.state.selectedModel)
  }

  selectModel() {
    const selectedModel = this.supportedModels.find(model => model.modelURL === this.elems.selectModel.value)
    this.state.selectedModel = selectedModel
    if (this.state.selectedModel.multimodal) {
      this.elems.buttonEmbed.setAttribute("disabled")
    } else {
      this.elems.buttonEmbed.removeAttribute("disabled")
    }
  }

  drawUpdateExplorer() {

    let colors = this.data.map(() => "grey");
    const sizes = this.data.map(() => 15);
    const borderWidths = this.data.map(() => {
      return 0
    });

    if (this.state.compareDocument) {
      // this.state.compareDocument.forEach(doc => colors[doc._index] = "blue");
      this.state.compareDocument.forEach(doc => borderWidths[doc._index] = 5);
      this.state.compareDocument.forEach(doc => sizes[doc._index] = 50);
    }
    if (this.state.focusDocument) {
      // colors[this.state.focusDocument._index] = "green";
      borderWidths[this.state.focusDocument._index] = 5
      sizes[this.state.focusDocument._index] = 50;
    }

    const colorMap = {};
    const opacitiesMap = new Map();
    const values = [...new Set(this.data.map(d => d.properties[this.state.colorBy]))].sort();
    const colorScheme = [[0,0,0.5625],[0,0,0.625],[0,0,0.6875],[0,0,0.75],[0,0,0.8125],[0,0,0.875],[0,0,0.9375],[0,0,1],[0,0.0625,1],[0,0.125,1],[0,0.1875,1],[0,0.25,1],[0,0.3125,1],[0,0.375,1],[0,0.4375,1],[0,0.5,1],[0,0.5625,1],[0,0.625,1],[0,0.6875,1],[0,0.75,1],[0,0.8125,1],[0,0.875,1],[0,0.9375,1],[0,1,1],[0.0625,1,0.9375],[0.125,1,0.875],[0.1875,1,0.8125],[0.25,1,0.75],[0.3125,1,0.6875],[0.375,1,0.625],[0.4375,1,0.5625],[0.5,1,0.5],[0.5625,1,0.4375],[0.625,1,0.375],[0.6875,1,0.3125],[0.75,1,0.25],[0.8125,1,0.1875],[0.875,1,0.125],[0.9375,1,0.0625],[1,1,0],[1,0.9375,0],[1,0.875,0],[1,0.8125,0],[1,0.75,0],[1,0.6875,0],[1,0.625,0],[1,0.5625,0],[1,0.5,0],[1,0.4375,0],[1,0.375,0],[1,0.3125,0],[1,0.25,0],[1,0.1875,0],[1,0.125,0],[1,0.0625,0],[1,0,0],[0.9375,0,0],[0.875,0,0],[0.8125,0,0],[0.75,0,0],[0.6875,0,0],[0.625,0,0],[0.5625,0,0],[0.5,0,0]]
    const numColorBlocks = Math.floor(colorScheme.length / values.length)
    const colorRange = values.map((_,i) => {
      const colorIndex = Math.floor(i*numColorBlocks + (numColorBlocks/2))
      return {
        'r': colorScheme[colorIndex][0]*255,
        'g': colorScheme[colorIndex][1]*255,
        'b': colorScheme[colorIndex][2]*255
      }
    });
    values.forEach((value, i) => {
      colorMap[value] = colorRange[i % colorRange.length]
    });
    const valueCounts = values.reduce((countsObj, value) => {
      countsObj[value] = this.data.filter(d => d.properties[this.state.colorBy] === value).length
      return countsObj
    }, {})
    const [maxCount, minCount] = [Math.max(...Object.values(valueCounts)), Math.min(...Object.values(valueCounts))]
    const opacitiesRange = Object.entries(valueCounts).sort((k1, k2) => k1-k2).reduce((opacitiesObj, [value, count]) => {
      const inverseNormalizedCount = 0.6 + ((maxCount - count)/(maxCount-minCount)) * (1-0.6)
      opacitiesObj[value] = inverseNormalizedCount
      return opacitiesObj
    }, {})
    values.forEach((value, i) => opacitiesMap.set(value, opacitiesRange[value]))
    // colors = this.data.map(d => d._measure);
    colors = this.data.map(d => {
      const colorObj = colorMap[d.properties[this.state.colorBy]]
      // const opacity = opacitiesMap.get(d.properties[this.state.colorBy])
      return `rgba(${colorObj.r},${colorObj.g},${colorObj.b},${1})`
    });
    const names = this.data.map(d => `Gleason score: ${d.properties[this.state.colorBy]}`)

    const update = {
      marker: { 
        color: colors,
        size: sizes,
        line: {
          width: 0
        }
        // colorscale: "Blues",
      }
    };
    // const colorRange = d3.schemeCategory10;
    // const values = [...new Set(this.data.map(d => d.properties[this.state.colorBy]))];
    // values.forEach((value, i) => colorMap.set(value, colorRange[i % colorRange.length]));
    // // colors = this.data.map(d => d._measure);
    // colors = this.data.map(d => colorMap.get(d.properties[this.state.colorBy]));

    // const update = {
    //   marker: { 
    //     color: colors,
    //     size: sizes,
    //     // colorscale: "Blues",
    //   }
    // };
    // // setTimeout is a workaround for a Plotly bug (https://github.com/plotly/plotly.js/issues/1025)
    // setTimeout(() => Plotly.restyle(this.elems.explorerContainer, update, [0]), 50);

    // setTimeout is a workaround for a Plotly bug (https://github.com/plotly/plotly.js/issues/1025)
    const legendTraces = values.map(value => {
      return {
        x: [null],
        y: [null],
        z: [null],
        mode: 'markers',
        type: 'scatter3d',
        marker: {
          color: colorMap[value],
          size: 10
        },
        name: value,
      };
    });
    setTimeout(() => {
      Plotly.restyle(this.elems.explorerContainer, update, [0])
      // if (!this.elems.explorerContainer.legendAdded) {
      //   Plotly.addTraces(this.elems.explorerContainer, legendTraces);
      //   this.elems.explorerContainer.legendAdded =
      // }
    }, 50);
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
      type: 'scatter3d',
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