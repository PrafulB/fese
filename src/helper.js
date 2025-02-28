let imagebox3Instance = {}

export function euclideanDistance(pointA, pointB) {
  if (pointA.length !== pointB.length) {
    throw new Error("Points must have the same dimensions");
  }

  return Math.sqrt(
    pointA
      .map((coord, index) => Math.pow(coord - pointB[index], 2))
      .reduce((sum, squaredDiff) => sum + squaredDiff, 0)
  );
}

export function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) {
    throw new Error("Vectors must have the same dimensions");
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magnitudeA += vecA[i] * vecA[i];
    magnitudeB += vecB[i] * vecB[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0; 
  }

  return dotProduct / (magnitudeA * magnitudeB);
}


export async function embedGemini(text, key, model="models/text-embedding-004") {
  const url = `https://generativelanguage.googleapis.com/v1beta/${model}:embedContent?key=${key}`

  if (key == null) {
    throw Error("No Gemini API key supplied.");
  } 
  
  const result = await fetch(url, {
    method:'POST',
    headers:{
      'Content-Type': 'application/json',
    },
    body:JSON.stringify(embeddingRequest(text))
  })

  return await result.json()
}

function embeddingRequest(text, model="models/text-embedding-004") {
  return {
    model,
    content: {
      parts: [ { text }]
    }
  }
}

export function hookDropdownButton(element, state, valueProperty, optionsProperty) {
  let button;
  if (typeof element == "string") {
    button = document.querySelector(selector);
    if (button == null) {
      throw new Error(`No element found for ${selector}`);
    }
  } else {
    button = element;
  }

  const dropdownContainer = document.createElement("div");
  dropdownContainer.className = "dropdown";
  button.replaceWith(dropdownContainer);
  button.setAttribute("data-bs-toggle", "dropdown");

  const list = document.createElement("div");
  list.className = "dropdown-menu";

  dropdownContainer.appendChild(button);
  dropdownContainer.appendChild(list);

  let options;

  function setOptions() {
    if (state[optionsProperty]) {
      options = state[optionsProperty].map((d) =>
        typeof d == "string" ? { label: d, value: d } : d
      );

      list.innerHTML = '';
      for (const option of options) {    
        const link = document.createElement("a");
        link.style.cursor = "pointer";
        // link.setAttribute("href", "#");
        link.innerText = option.label;
        link.classList.add("dropdown-item", "cursor-pointer");
        if (option.value == state[valueProperty]) {
          link.classList.add("active");
        }

        link.addEventListener("click", () => {
          state[valueProperty] = option.value;
        });

        list.appendChild(link);
        option.element = link;
      }
    }
  }

  state.subscribe(optionsProperty, () => {
    setOptions();
  });

  state.subscribe(valueProperty, () => {
    options.forEach(option => {
      if (option.value == state[valueProperty]) {
        option.element.classList.add("active");
      } else {
        option.element.classList.remove("active");
      }
    });
  });
}

export function createDropdownButton(button, dropdownOptions, options={}) {
  const dropdownContainer = document.createElement("div");
  dropdownContainer.className = "dropdown";

  button.replaceWith(dropdownContainer);

  // Adding Bootstrap toggle attribute
  button.setAttribute("data-bs-toggle", "dropdown");

  // Add class for cursor change
  // button.classList.add("dropdown-toggle", "cursor-pointer");

  const list = document.createElement("ul");
  list.className = "dropdown-menu";

  if (options.header) {
    const headerElement = document.createElement("h6");
    headerElement.className = "dropdown-header";
    headerElement.innerText =options.header;
    list.appendChild(headerElement);
  }

  // Loop through the options to create dropdown items
  for (const option of dropdownOptions) {
    const item = document.createElement("li");

    const link = document.createElement("a");
    link.innerText = option.text;
    link.classList.add("dropdown-item", "cursor-pointer");
    item.appendChild(link);

    // Pass the event to the callback when the item is clicked
    if (option.callback) {
      item.addEventListener("click", (event) => option.callback(event));
    }

    if (option.id) {
      item.setAttribute("id", option.id);
    }

    list.appendChild(item);
  }

  dropdownContainer.appendChild(button);
  dropdownContainer.appendChild(list);

  return dropdownContainer;
}

export async function getTCGAStudy(fileId) {
  const tcgaBasePath = `https://api.gdc.cancer.gov/files?pretty=true`
  const filters = `filters={ "op": "=", "content": {"field": "files.file_id", "value": "${fileId}"}}`
  const fields = `fields=cases.project.project_id,cases.case_id,file_name,type`
  let fileInfoFromTCGA = undefined
  try {
    fileInfoFromTCGA = await (await fetch(`${tcgaBasePath}&${filters}&${fields}`)).json()
    const tcgaStudy = fileInfoFromTCGA.data.hits[0].cases[0].project.project_id.replace("TCGA-", "")
    return tcgaStudy
  } catch (e) {
    console.warn("Error retrieving information for WSI from TCGA: ", e)
    return undefined
  }
}

export function getTCGAURL(imageId) {
  const tcgaBasePath = 'https://api.gdc.cancer.gov/data'
  let imageURL = imageId
  if (!imageURL.startsWith('http')) {
    imageURL = `${tcgaBasePath}/${imageId}`
  }
  return imageURL
}

export function getGCSURL(imageName) {
  const gcsBasePath = 'https://storage.googleapis.com/tcga-wsi-for-embedding/'
  let imageURL = imageName
  if (!imageURL.startsWith('http')) {
    imageURL = `${gcsBasePath}/${imageId}`
  }
  return imageURL
}

export async function getImageInfo(imageId) {
  const imagebox3 = await import("https://episphere.github.io/imagebox3/imagebox3.mjs")
  
  const imageURL = getTCGAURL(imageId)
  // const imageURL = getGCSURL(imageId)
  if (imagebox3Instance.imageSource !== imageURL || !imagebox3Instance.tiff) {
    imagebox3Instance = new imagebox3.Imagebox3(imageURL);
    await imagebox3Instance.init();
  }
  
  const imageInfo = await imagebox3Instance.getInfo();
  return imageInfo
}

export async function getTile(imageId, tileParams=256) {
  const imagebox3 = await import("https://episphere.github.io/imagebox3/imagebox3.mjs")
  
  const imageURL = getTCGAURL(imageId)
  // const imageURL = getGCSURL(imageId)
  if (imagebox3Instance.imageSource !== imageURL || !imagebox3Instance.tiff) {
    imagebox3Instance = new imagebox3.Imagebox3(imageURL, 1);
    await imagebox3Instance.init();
  }
  // const compression = imagebox3Instance.tiff.allImages.find(i => i.fileDirectory.ImageLength === imagebox3Instance.tiff.maxHeight && i.fileDirectory.ImageWidth === imagebox3Instance.tiff.maxWidth).fileDirectory.Compression
  // if (compression !== 7) {
  //     await imagebox3Instance.createWorkerPool(1)
  // }

  let tileURL = ""
  if (typeof(tileParams) === 'object') {
    tileURL = URL.createObjectURL(await imagebox3Instance.getTile(...Object.values(tileParams)));
  } else if (Number.isInteger(tileParams)) {
    const imageInfo = await imagebox3Instance.getInfo();
    const thumbnailWidth = tileParams
    const thumbnailHeight = Math.floor(thumbnailWidth * imageInfo.height/imageInfo.width)
    tileURL = URL.createObjectURL(await imagebox3Instance.getThumbnail(thumbnailWidth, thumbnailHeight))
  }
  return tileURL
}

const isTileEmpty = (canvas, ctx, threshold=0.9, returnEmptyProportion=false) => {

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const pixels = imageData.data
  const numPixels = pixels.length / 4

  let whitePixelCount = 0

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]
    const g = pixels[i + 1]
    const b = pixels[i + 2]

    if (r > 200 && g > 200 && b > 200) {
        whitePixelCount++
    }
  }

  const whitePercentage = whitePixelCount / numPixels
  let isEmpty = false
  if (whitePercentage >= threshold) {
    isEmpty = true
  }
  if (returnEmptyProportion) {
    return whitePercentage
  }
  return isEmpty

}

const findTissueRegionsInImage = (gridDim=8, thumbnailWidth=1024) => new Promise(async (resolve, reject) => {
  
  const imageInfo = await imagebox3Instance.getInfo();
  const thumbnailHeight = thumbnailWidth * imageInfo.height/imageInfo.width
  imagebox3Instance.getThumbnail(thumbnailWidth, thumbnailHeight).then(blob => {

    const thumbnailURL = URL.createObjectURL(blob);
    const thumbnailImg = new Image()
    thumbnailImg.crossOrigin = "Anonymous"
    thumbnailImg.src = thumbnailURL
    const offscreenCanvas = new OffscreenCanvas(thumbnailWidth/gridDim, thumbnailHeight/gridDim)
    const offscreenCtx = offscreenCanvas.getContext('2d')
    const thumbnailRegions = Array(8).fill(undefined).map((row, rowIdx) => Array(gridDim).fill(undefined).map((col, colIdx) => [thumbnailWidth*rowIdx/gridDim, thumbnailHeight*colIdx/gridDim])).flat()
    thumbnailImg.onload = () => {
      const tissueRegions = thumbnailRegions.map(([x, y]) => {
        offscreenCtx.drawImage(thumbnailImg, x, y, offscreenCanvas.width, offscreenCanvas.height, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
        const emptyPercentage = isTileEmpty(offscreenCanvas, offscreenCtx, 0.9, true)
        const topX = Math.floor(x * imageInfo.width/thumbnailWidth)
        const topY = Math.floor(y * imageInfo.height/thumbnailHeight)
        const bottomX = topX + Math.floor(imageInfo.width/gridDim)
        const bottomY = topY + Math.floor(imageInfo.height/gridDim)
        return {
          topX,
          topY,
          bottomX,
          bottomY,
          emptyPercentage
        }
      }).sort((a,b) => a.emptyPercentage-b.emptyPercentage).slice(0,8)
      resolve(tissueRegions)
    }

  }).catch(e => resolve([]))
})

const getRandomTileParams = async (imagebox3Instance, tissueRegions) => {
  const imageInfo = await imagebox3Instance.getInfo();
  let randomRegion = {
    'topX': 0,
    'topY': 0,
    'bottomX': imageInfo.width,
    'bottomY': imageInfo.height
  }
  if (Array.isArray(tissueRegions) && tissueRegions.length > 0) {
    randomRegion = tissueRegions[Math.floor(Math.random() * tissueRegions.length)]
  }
  return {
    'tileX': Math.floor(randomRegion.topX + Math.random() * (randomRegion.bottomX - randomRegion.topX - 224)),
    'tileY': Math.floor(randomRegion.topY + Math.random() * (randomRegion.bottomY - randomRegion.topY - 224)),
    'tileWidth': imageInfo?.pixelsPerMeter ? imageInfo.pixelsPerMeter * 128 : 256,
    'tileHeight': imageInfo?.pixelsPerMeter ? imageInfo.pixelsPerMeter * 128 : 256,
    'tileSize': 224
  }
}

const columnWiseAverageOfEmbeddings = (embeddings) => {
  if (embeddings.length === 0) return [];

  const numColumns = embeddings[0].embedding.length;
  const averages = new Array(numColumns).fill(0);

  // Sum up each column
  for (let i = 0; i < numColumns; i++) {
      let columnSum = 0;
      for (let j = 0; j < embeddings.length; j++) {
          columnSum += embeddings[j].embedding[i];
      }
      // Calculate average for the column
      averages[i] = columnSum / embeddings.length;
  }

  return averages;
}

export const samplePatchesAndEmbedSlide = async (wsiURL, numPatches, encoderModel) => {
  const onnxRuntime = await import(
    "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/esm/ort.min.js"
  )
  onnxRuntime.env.wasm.wasmPaths =
      "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/";


  let slideEmbeddings = []
  if (imagebox3Instance.imageSource !== wsiURL) {
    const imagebox3Instance = new Imagebox3.Imagebox3(`${tcgaBasePath}/${img.file_id}`)
    await imagebox3Instance.init()
  }
  const tissueRegions = await findTissueRegionsInImage(imagebox3Instance)
  let currentPatchNum = 0
  const patchEmbeddings = []
  while (currentPatchNum < numPatches) {
    const tileParams = await getRandomTileParams(imagebox3Instance, tissueRegions)
    if (!isNaN(tileParams.tileX)) {
      let tileURL = undefined
      try {
        tileURL = URL.createObjectURL(await imagebox3Instance.getTile(...Object.values(tileParams)))
      } catch (e) {
        console.log(wsiURL, e)
        continue
      }
      const canvas = new OffscreenCanvas(tileParams.tileSize, tileParams.tileSize)
      const ctx = canvas.getContext("2d");
      
      const imageTensor = await new Promise((resolve) => {
        const tempImg = new Image();
        tempImg.src = tileURL;
        tempImg.crossOrigin = "anonymous";
        tempImg.onload = () => {
          ctx.drawImage(tempImg, 0, 0);
          if (isTileEmpty(canvas, ctx)) {
            resolve(undefined)
          }
          const pixelArray = Array.from(
          ctx
            .getImageData(0, 0, tileParams.tileSize, tileParams.tileSize)
            .data.filter((v, i) => i % 4 !== 3)
          );
          
          resolve(new onnxRuntime.Tensor("float32", imageTransforms(pixelArray), [1, 3, 224, 224]));
        };
      })
      if (!imageTensor) {
        continue
      }
      const { embedding: { cpuData } } = await encoderModel.run({ image: imageTensor });
      const embedding = Object.values(cpuData)
      patchEmbeddings.push({
        wsiURL,
        tileParams,
        embedding
      })
      currentPatchNum+=1
    }
  }
  if (patchEmbeddings.length > 0) {
    slideEmbeddings = columnWiseAverageOfEmbeddings(patchEmbeddings)
  }
  return slideEmbeddings
}

export function imageTransforms(
  imageTensor,
  mean = [0.485, 0.456, 0.406],
  std = [0.229, 0.224, 0.225]
) {
  const maxPixelValue = imageTensor.reduce((max, curr) =>
    max <= curr ? curr : max
  );
  const minPixelValue = imageTensor.reduce((min, curr) =>
    min >= curr ? curr : min
  );
  const minMaxNormalizedTensor = imageTensor.map(
    (v) => (v - minPixelValue) / (maxPixelValue - minPixelValue)
  );

  const normalizeImage = (image, mean, std) => {
    const normalizedImage = image.map(
      (value, index) => (value - mean[index % 3]) / std[index % 3]
    );
    return normalizedImage;
  };

  const normalizedImage = normalizeImage(minMaxNormalizedTensor, mean, std);
  return normalizedImage;
}