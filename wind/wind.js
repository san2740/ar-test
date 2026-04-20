import * as Cesium from 'cesium'
import ComputePrimitive from '@/modules/compute/ComputePrimitive'
import RenderPrimitive from '@/modules/compute/RenderPrimitive'
import { LonLatAltVolume } from '../compute/Volume'

import fragmentShader_calculateWindPosition from '@/modules/wind/glsl/calculateWindPosition.frag?raw'
import vertexShader_ecef2projected_line from '@/modules/wind/glsl/ecef2projected_line.vert?raw'
import fragmentShader_ecef2projected_line from '@/modules/wind/glsl/ecef2projected_line.frag?raw'

import { kas as kasGridDef } from '@/domain/lambert_conformal_conic_grids.js'
import fragmentShader from '@/modules/sliceplot/glsl/fragment.frag?raw'
import fragmentShader_mono from '@/modules/sliceplot/glsl/fragment_mono_normalized.frag?raw'
import clipping_vertexShader from '@/modules/wind/glsl/clipping_vertex.vert?raw'
import { revokeSubFilterAndDequantization } from '@/modules/PNGFilterAlgorithms.js'

export default class Wind {
  static MIN_TRAIL_LENGTH = 2
  static MAX_TRAIL_LENGTH = 15

  constructor(viewer, context, options) {
    const refinedOptions = Object.assign(
      {
        /* default options */
        projection: 'regular', // 'regular', 'lambert-conformal-conic'
        textureSize: 1000,
        speedFactor: 1000.0,
        renderingType: 'triangle',
        // trailLength: 5,
        point: {
          size: 2,
        },
        triangle: {
          lineWidth: 1000.0,
        },
        timeScale: 3,
        timeScaleCounter: 0, // for time scale

        // KAS 모델 Lambert Conformal Coninc 프로젝션용 상수
        lambertConformalConic: kasGridDef,
      },
      options,
      {
        trailLength: options.trailLength
          ? Math.max(Wind.MIN_TRAIL_LENGTH, Math.min(Wind.MAX_TRAIL_LENGTH, options.trailLength))
          : 10, // position buffer length (for position history)
      }
    )
    Object.assign(this, refinedOptions)

    this.viewer = viewer
    this.context = context
    const collection = (this.primitiveCollection = new Cesium.PrimitiveCollection()) // output primitive collection

    const that = this

    // 변하지않는 초기화 파라미터들 input data
    const {
      dimension,
      altitudes,
      uvws,
      boundary,
      textureSize,
      trailLength,
      renderingType,
      valueMinMax,
      velocityMinMax,
      wens,
    } = this

    const volume = new LonLatAltVolume(boundary, [altitudes[0], altitudes[altitudes.length - 1]])
    this.volume = volume // save volume for later use

    const width = dimension[0];
    const height = dimension[1];
    const levels = altitudes.length;
    const combinedUVWs =  new Float32Array(width * height * levels * 4);
    let ptr = 0;
    for (let levelIndex = 0; levelIndex < levels; levelIndex++) {
      for (let j = 0; j < height; j++) {
        for (let i = 0; i < width; i++) {
          const idx = i + j * width;
          combinedUVWs[ptr++] = (valueMinMax[0][1] - valueMinMax[0][0]) ? (uvws.u[levelIndex][idx] - valueMinMax[0][0]) / (valueMinMax[0][1] - valueMinMax[0][0]) : 0.0;
          combinedUVWs[ptr++] = (valueMinMax[1][1] - valueMinMax[1][0]) ? (uvws.v[levelIndex][idx] - valueMinMax[1][0]) / (valueMinMax[1][1] - valueMinMax[1][0]) : 0.0;
          combinedUVWs[ptr++] = (valueMinMax[2][1] - valueMinMax[2][0]) ? (uvws.w[levelIndex][idx] - valueMinMax[2][0]) / (valueMinMax[2][1] - valueMinMax[2][0]) : 0.0;
          combinedUVWs[ptr++] = 1.0;
        }
      }
    }
    const combinedWindSpeedTextures = this.createTexture({
        context: context,
        width: dimension[0],
        height: dimension[1] * altitudes.length,
        pixelFormat: Cesium.PixelFormat.RGBA,
        pixelDatatype: Cesium.PixelDatatype.FLOAT,
        flipY: false,
        sampler: new Cesium.Sampler({
          // the values of texture will not be interpolated
          minificationFilter: Cesium.TextureMinificationFilter.NEAREST, // LINEAR 로 자동 보간
          magnificationFilter: Cesium.TextureMagnificationFilter.NEAREST, // LINEAR 로 자동 보간
        }),
    }, new Float32Array(combinedUVWs))
    that.combinedWindSpeedTextures = combinedWindSpeedTextures

    // wind speed & position
    let positionTextures = new Array(trailLength).fill(0).map(() => this.createTexture({
          context: context,
          width: textureSize,
          height: textureSize,
          pixelFormat: Cesium.PixelFormat.RGBA,
          pixelDatatype: Cesium.PixelDatatype.FLOAT,
          flipY: false,
          sampler: new Cesium.Sampler({
            // the values of texture will not be interpolated
            minificationFilter: Cesium.TextureMinificationFilter.NEAREST, // => LINEAR 로 사용 대체 확인 필요
            magnificationFilter: Cesium.TextureMagnificationFilter.NEAREST, // => LINEAR 로 사용 대체 확인 필요
          }),
        }, new Float32Array(new Array(textureSize * textureSize * 4).fill(0))
      )
    )

    this.windPositionTextures = positionTextures;
    this._emptyParticleTex = new Float32Array(textureSize * textureSize * 4);

    const windPosition = new ComputePrimitive({
      fragmentShaderSource: new Cesium.ShaderSource({
        sources: [fragmentShader_calculateWindPosition]
      }),
      uniformMap: Object.assign({}, {
          windPositionTexture: function () {
            return that.windPositionTextures[1] // current position
          },
          windSpeedTextures: function () {
            return that.combinedWindSpeedTextures
          },
          dimensions: function () {
            return new Cesium.Cartesian3(that.dimension[0], that.dimension[1], that.altitudes.length)
          },
          altitudes: function () {
            return that.altitudes
          },
          minValues: function () {
            return new Cesium.Cartesian3(that.valueMinMax[0][0], that.valueMinMax[1][0], that.valueMinMax[2][0])
          },
          maxValues: function () {
            return new Cesium.Cartesian3(that.valueMinMax[0][1], that.valueMinMax[1][1], that.valueMinMax[2][1])
          },
          velocityMinMax: function () {
            return that.velocityMinMax ? that.velocityMinMax : [0.0, 0.0]
          },
          bounds: function () {
            return that.volume.bounds.map((v) => new Cesium.Cartesian3(v[0], v[1], v[2])).slice(0, 4)
          },
          altitudeBounds: function () {
            return that.volume.getAltitudeRange()
          },
          speedFactor: function () {
            return that.speedFactor * that.timeScale
          },
          randomParam: function () {
            return Math.random()
          },
          clipping: function () {
            return that.clipping ? that.clipping : [0.0, 1.0, 0.0, 1.0, 0.0, 1.0]
          },
          // targetValue: function () {
          //     return that.targetValue;
          // },
          filters: function () {
            return that.filter ? that.filter : [0.0, 1.0, 0.0, 1.0, 0.0, 1.0]
          },
          velocityFilter: function () {
            return that.velocityFilter ? that.velocityFilter : [0.0, 1.0]
          },
          verticalScale: function () {
            return that.verticalScale || 1.0 // vertical scale factor for altitude
          },
          wens: function () {
            return that.wens ? that.wens : [0.0, 360.0, 90.0, 0.0]
          },
          clippingPoints: function () {
            return (
              that.clippingPoints ?? [
                [0, 0, 0],
                [0, 0, 0],
                [0, 0, 0],
                [0, 0, 0],
                [0, 0, 0],
              ]
            ).map((lonlatalt) => new Cesium.Cartesian3(lonlatalt[0], lonlatalt[1], lonlatalt[2]))
          },
          typhoonHighlightMode: function () {
            return that.typhoonHighlightMode ?? 0;
          },
        }
      ),
      outputTexture: that.windPositionTextures[0], // next position
      preExecute: function (primitive) {
        // swap textures before binding
        that.timeScaleCounter -= 1
        if (that.timeScaleCounter < 0) {
          that.timeScaleCounter = that.timeScale
          that.windPositionTextures.unshift(that.windPositionTextures.pop())
        }

        // keep the outputTexture up to date
        primitive.commandToExecute.outputTexture = that.windPositionTextures[0]
      },
    })

    const ecefToProjected = this.createRenderingLine(context, that.windPositionTextures)

    collection.add(windPosition)
    collection.add(ecefToProjected)
  }

  updateParameters(options) {
    const prevClip = JSON.stringify(this.clippingPoints ?? null);

    Object.assign(this, options);

    const nextClip = JSON.stringify(this.clippingPoints ?? null);
    const clipChanged = prevClip !== nextClip;

    if (!clipChanged) return;

    if (this.mc) {
      this.primitiveCollection.remove(this.mc);
      if (typeof this.mc.destroy === "function" && !this.mc.isDestroyed?.()) {
        this.mc.destroy();
      }
      this.mc = undefined;
    }

    const hasClip = Array.isArray(this.clippingPoints) && this.clippingPoints.length === 2 && (this.clippingPoints[0][0] !== 0 || this.clippingPoints[0][1] !== 0);

    if (hasClip) {
      this.mc = this.createMc();
      this.primitiveCollection.add(this.mc);
    }
  }

  createMc() {
    const that = this;
    const context = this.context;
    const dimension = this.dimension;
    const altitudes = this.altitudes;

    return new RenderPrimitive(context, {
      attributeLocations: { position: 0, st: 1, normal: 2 },
      geometry: this.createClippingGeometry(256, altitudes.length),
      primitiveType: Cesium.PrimitiveType.TRIANGLES,
      uniformMap: {
        windSpeedTextures: () => that.combinedWindSpeedTextures,
        dimensions: () => new Cesium.Cartesian3(dimension[0], dimension[1], altitudes.length),
        altitudes: () => altitudes,
        bounds: () => that.volume.bounds.map(v => new Cesium.Cartesian3(v[0], v[1], v[2])).slice(0, 4),
        altitudeBounds: () => that.volume.getAltitudeRange(),
        verticalScale: () => that.verticalScale || 1.0,
        minValues: () => new Cesium.Cartesian3(that.valueMinMax[0][0], that.valueMinMax[1][0], that.valueMinMax[2][0]),
        maxValues: () => new Cesium.Cartesian3(that.valueMinMax[0][1], that.valueMinMax[1][1], that.valueMinMax[2][1]),
        velocityMinMax: () => that.velocityMinMax ?? [0.0, 0.0],
        filters: () => that.filter ?? [0, 1, 0, 1, 0, 1],
        velocityFilter: () => that.velocityFilter ?? [0, 1],
        alpha: () => that.alpha ?? 1.0,
        clippingPoints: () =>
          (that.clippingPoints ?? [[0,0,0],[0,0,0]])
            .map(p => new Cesium.Cartesian3(p[0], p[1], p[2])),
        wens: () => that.wens ?? [0.0, 360.0, 90.0, 0.0],
        colorMode: function () {
          return that.colorMode === 'windspeed' ? 0 :
            that.colorMode === 'relativehumidity' ? 1 :
              that.colorMode === 'temperature' ? 2 :
                0;
        },
        customColorTextures: function () {
          return (that.colorMode !== 'windspeed') ? (that.customColorTextures || {}) : {}
        },
      },
      vertexShaderSource: new Cesium.ShaderSource({ sources: [clipping_vertexShader] }),
      fragmentShaderSource: new Cesium.ShaderSource({ sources: [that.colorMode === 'windspeed' ? fragmentShader : fragmentShader_mono] }),
      rawRenderState: this.createRawRenderState({
        depthTest: { enabled: true },
        depthMask: true,
        blending: { enabled: true },
      }),
      autoClear: false,
    });
  }

  updateCustomColorTexture(customColorGrid) {
    const context = this.context
    const dimension = customColorGrid.dimensions
    const altitudes = customColorGrid.altitudes
    const width = dimension[0];
    const height = dimension[1];
    const levels = altitudes.length;
    const combinedValues =  new Float32Array(width * height * levels * 4);
    let ptr = 0;
    for (let levelIndex = 0; levelIndex < levels; levelIndex++) {
      for (let j = 0; j < height; j++) {
        for (let i = 0; i < width; i++) {
          const v = customColorGrid.values[levelIndex][i + j * width]
          combinedValues[ptr++] = v;
          combinedValues[ptr++] = v;
          combinedValues[ptr++] = v;
          combinedValues[ptr++] = 1.0;
        }
      }
    }
    this.customColorTextures = this.createTexture(
      {
        context: context,
        width: dimension[0],
        height: dimension[1] * altitudes.length,
        pixelFormat: Cesium.PixelFormat.RGBA,
        pixelDatatype: Cesium.PixelDatatype.FLOAT,
        flipY: false,
        sampler: new Cesium.Sampler({
          // the values of texture will not be interpolated
          minificationFilter: Cesium.TextureMinificationFilter.NEAREST, // LINEAR 로 자동 보간
          magnificationFilter: Cesium.TextureMagnificationFilter.NEAREST, // LINEAR 로 자동 보간
        }),
      }, new Float32Array(combinedValues))
  }

  getPrimitiveCollection() {
    return this.primitiveCollection
  }
  createTexture(options, typedArray) {
    // console.log('createTexture', options, typedArray)
    if (Cesium.defined(typedArray)) {
      // typed array needs to be passed as source option, this is required by Cesium.Texture
      var source = {}
      source.arrayBufferView = typedArray
      options.source = source
    }

    var texture = new Cesium.Texture(options)
    return texture
  }
  createRawRenderState(options) {
    var translucent = true
    var closed = false
    var existing = {
      viewport: options.viewport,
      depthTest: options.depthTest,
      depthMask: options.depthMask,
      blending: options.blending,
    }

    var rawRenderState = Cesium.Appearance.getDefaultRenderState(translucent, closed, existing)
    return rawRenderState
  }
  createRenderingLine(context, trailTextures) {
    const that = this
    return new RenderPrimitive(context, {
      allowPicking: false,
      attributeLocations: {
        st: 1,
        normal: 2,
      },
      geometry: this.createLineStringGeometry(trailTextures),
      primitiveType: Cesium.PrimitiveType.LINES,
      uniformMap: Object.assign(
        {},
        {
          windSpeedTextures: function () {
            return that.combinedWindSpeedTextures
          },
          trailLength: function () {
            return trailTextures.length
          },
          trailECEFPositionTextures: function () {
            return trailTextures
          },
          // color: function () {
          //     return colorTexture;
          // },
          particleRate: function () {
            return that.particleRate ?? 1.0 // particle rate for rendering
          },
          colorMode: function () {
            return that.colorMode === 'windspeed' ? 0 :
                that.colorMode === 'altitude' ? 1 :
                that.colorMode === 'relativehumidity' ? 2 :
                that.colorMode === 'temperature' ? 3 :
                0;
          },
          bounds: function () {
            return that.volume.bounds
              .map((v) => new Cesium.Cartesian3(v[0], v[1], v[2]))
              .slice(0, 5)
          },
          altitudeBounds: function () {
            return that.volume.getAltitudeRange()
          },
          verticalScale: function () {
            return that.verticalScale || 1.0 // vertical scale factor for altitude
          },
          dimensions: function () {
            return new Cesium.Cartesian3(
              that.dimension[0],
              that.dimension[1],
              that.altitudes.length
            )
          },
          altitudes: function () {
            return that.altitudes
          },
          minValues: function () {
            return new Cesium.Cartesian3(
              that.valueMinMax[0][0],
              that.valueMinMax[1][0],
              that.valueMinMax[2][0]
            )
          },
          maxValues: function () {
            return new Cesium.Cartesian3(
              that.valueMinMax[0][1],
              that.valueMinMax[1][1],
              that.valueMinMax[2][1]
            )
          },
          highlights: function () {
            return that.highlights ?? []
          },
          customColorTextures: function () {
            return (that.colorMode === 'relativehumidity' || that.colorMode === 'temperature') ? (that.customColorTextures || {}) : {}
          },
          typhoonCenterCount: function () {
            return that.typhoonCenterCount ?? 0;
          },
          typhoonCenters: function () {
            const src = that.typhoonCenters ?? [];
            const padded = [];
            const maxCenters = 10;

            for (let i = 0; i < maxCenters; i++) {
              const c = src[i] ?? { lon: 0, lat: 0, radius: 0, strength: 0 };
              padded.push(new Cesium.Cartesian4(c.lon, c.lat, c.radius, c.strength));
            }

            return padded;
          },
          typhoonHighlightMode: function () {
            return that.typhoonHighlightMode ?? 0;
          },
          speedMin() {
            return that.speedRange[0] ?? -1.0
          },
          speedMax() {
            return that.speedRange[1] ?? 100.0
          },
        }
      ),
      vertexShaderSource: new Cesium.ShaderSource({
        sources: [vertexShader_ecef2projected_line],
      }),
      fragmentShaderSource: new Cesium.ShaderSource({
        sources: [fragmentShader_ecef2projected_line]
      }),
      rawRenderState: this.createRawRenderState({
        // viewport: undefined,
        depthTest: {
          enabled: true,
        },
        depthMask: true,
        blending: {
          enabled: true,
        },
      }),
      // framebuffer: this.createFramebuffer(context, projectedTexture, projectedDepth),
      // autoClear: true,
    })
  }

  createLineStringGeometry(textures) {
    const lineLength = textures.length
    const texture = textures[0]

    var st = []
    {
      for (let s = 0; s < texture.width; s++) {
        for (let t = 0; t < texture.height; t++) {
          for (let i = 0; i < lineLength; i++) {
            st.push(s / texture.width)
            st.push(t / texture.height)
          }
        }
      }
      st = new Float32Array(st)
    }

    var normal = []
    {
      for (let s = 0; s < texture.width; s++) {
        for (let t = 0; t < texture.height; t++) {
          for (let i = 0; i < lineLength; i++) {
            normal.push(i) // trail index
            normal.push(0) // trail order
            normal.push(0) // unused
          }
        }
      }
      normal = new Float32Array(normal)
    }

    const indexSize = (lineLength - 1) * texture.width * texture.height * 2
    let vIndex = 0
    var vertexIndexes = new Uint32Array(indexSize)
    {
      for (let particleIndex = 0; particleIndex < texture.width * texture.height; particleIndex++) {
        // for each particle,
        let startVertexIndex = particleIndex * lineLength

        for (let j = 0; j < lineLength - 1; j++) {
          vertexIndexes[vIndex++] = startVertexIndex + j
          vertexIndexes[vIndex++] = startVertexIndex + j + 1
        }
      }
    }

    var geometry = new Cesium.Geometry({
      attributes: new Cesium.GeometryAttributes({
        st: new Cesium.GeometryAttribute({
          componentDatatype: Cesium.ComponentDatatype.FLOAT,
          componentsPerAttribute: 2,
          values: st,
        }),
        normal: new Cesium.GeometryAttribute({
          componentDatatype: Cesium.ComponentDatatype.FLOAT,
          componentsPerAttribute: 3,
          values: normal,
        }),
      }),
      indices: vertexIndexes,
    })

    return geometry
  }

  createClippingGeometry(sCount = 256, zCount) {
    const st = new Float32Array(sCount * zCount * 2);
    const normal = new Float32Array(sCount * zCount * 3);
    let p = 0;
    let n = 0;

    for (let i = 0; i < sCount; i++) {
      const s = sCount === 1 ? 0 : i / (sCount - 1);
      for (let k = 0; k < zCount; k++) {
        const t = zCount === 1 ? 0 : k / (zCount - 1);
        st[p++] = s;
        st[p++] = t;

        // normal은 기존 코드 구조상 attributeLocations 맞추기용
        normal[n++] = 3;   // plane id 같은 용도로 안 써도 됨
        normal[n++] = 0;
        normal[n++] = 0;
      }
    }

    // indices (grid triangulation)
    const indices = new Uint32Array((sCount - 1) * (zCount - 1) * 6);
    let idx = 0;
    for (let i = 0; i < sCount - 1; i++) {
      for (let k = 0; k < zCount - 1; k++) {
        const a = i * zCount + k;
        const b = a + 1;
        const c = (i + 1) * zCount + k + 1;
        const d = (i + 1) * zCount + k;

        indices[idx++] = a;
        indices[idx++] = b;
        indices[idx++] = c;

        indices[idx++] = a;
        indices[idx++] = c;
        indices[idx++] = d;
      }
    }

    return new Cesium.Geometry({
      attributes: new Cesium.GeometryAttributes({
        st: new Cesium.GeometryAttribute({
          componentDatatype: Cesium.ComponentDatatype.FLOAT,
          componentsPerAttribute: 2,
          values: st
        }),
        normal: new Cesium.GeometryAttribute({
          componentDatatype: Cesium.ComponentDatatype.FLOAT,
          componentsPerAttribute: 3,
          values: normal
        }),
      }),
      indices
    });
  }

  updateWindTextures(json) {
    const width = json.dimensions[0];
    const height = json.dimensions[1];
    const levels = json.altitudes.length;

    const texW = this.combinedWindSpeedTextures.width;
    const texH = this.combinedWindSpeedTextures.height;

    if (texW !== width || texH !== height * levels) {
      console.log('기존 텍스쳐 width height 다름');
      return;
    }

    const uLevels = json.us.map(ary => revokeSubFilterAndDequantization(ary, json.uMinMax));
    const vLevels = json.vs.map(ary => revokeSubFilterAndDequantization(ary, json.vMinMax));
    const wLevels = json.ws.map(ary => revokeSubFilterAndDequantization(ary, json.wMinMax));

    const combinedUVWs = new Float32Array(width * height * levels * 4);
    let ptr = 0;

    const uMin = json.uMinMax[0], uMax = json.uMinMax[1];
    const vMin = json.vMinMax[0], vMax = json.vMinMax[1];
    const wMin = json.wMinMax[0], wMax = json.wMinMax[1];

    const uDen = (uMax - uMin) || 0;
    const vDen = (vMax - vMin) || 0;
    const wDen = (wMax - wMin) || 0;

    for (let levelIndex = 0; levelIndex < levels; levelIndex++) {
      const u = uLevels[levelIndex];
      const v = vLevels[levelIndex];
      const w = wLevels[levelIndex];

      for (let j = 0; j < height; j++) {
        for (let i = 0; i < width; i++) {
          const idx = i + j * width;

          combinedUVWs[ptr++] = uDen ? (u[idx] - uMin) / uDen : 0.0;
          combinedUVWs[ptr++] = vDen ? (v[idx] - vMin) / vDen : 0.0;
          combinedUVWs[ptr++] = wDen ? (w[idx] - wMin) / wDen : 0.0;
          combinedUVWs[ptr++] = 1.0;
        }
      }
    }

    this.combinedWindSpeedTextures.copyFrom({
      source: {
        width,
        height: height * levels,
        arrayBufferView: combinedUVWs
      }
    });

    this.dimension = json.dimensions;
    this.altitudes = json.altitudes;
    this.valueMinMax = [json.uMinMax, json.vMinMax, json.wMinMax];
    this.velocityMinMax = json.valueMinMax;
    this.boundary = json.boundaries;

    this.volume = new LonLatAltVolume(this.boundary, [
      this.altitudes[0],
      this.altitudes[this.altitudes.length - 1],
    ]);

  }

}
