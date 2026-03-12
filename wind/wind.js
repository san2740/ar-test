import ComputePrimitive from "../compute/ComputePrimitive.js";
import RenderPrimitive from "../compute/RenderPrimitive.js";
import { LonLatAltVolume } from "../compute/Volume.js";

async function loadText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`파일 로드 실패: ${url}`);
  return await res.text();
}

const fragmentShader_calculateWindPosition =
  await loadText('./wind/glsl/calculateWindPosition.frag');

const fragmentShader_calculateWindPosition_lcc =
  await loadText('./wind/glsl/calculateWindPosition_lcc.frag');

const fragmentShader_calculateWindColor =
  await loadText('./wind/glsl/calculateWindColor.frag');

const fragmentShader_normalized2ecef =
  await loadText('./wind/glsl/normalized2ecef.frag');

const vertexShader_ecef2projected_point =
  await loadText('./wind/glsl/ecef2projected_point.vert');

const vertexShader_ecef2projected_point_lcc =
  await loadText('./wind/glsl/ecef2projected_point_lcc.vert');

const fragmentShader_ecef2projected_point =
  await loadText('./wind/glsl/ecef2projected_point.frag');

const vertexShader_ecef2projected_line =
  await loadText('./wind/glsl/ecef2projected_line.vert');

const vertexShader_ecef2projected_line_lcc =
  await loadText('./wind/glsl/ecef2projected_line_lcc.vert');

const fragmentShader_ecef2projected_line =
  await loadText('./wind/glsl/ecef2projected_line.frag');

const vertexShader_ecef2projected_triangle =
  await loadText('./wind/glsl/ecef2projected_triangle.vert');

const vertexShader_ecef2projected_triangle_lcc =
  await loadText('./wind/glsl/ecef2projected_triangle_lcc.vert');

const fragmentShader_ecef2projected_triangle =
  await loadText('./wind/glsl/ecef2projected_triangle.frag');

const vertexShader_fullscreen =
  await loadText('./wind/glsl/fullscreen.vert');

const fragmentShader_screenDraw =
  await loadText('./wind/glsl/screenDraw.frag');

export default class Wind {
    static MIN_TRAIL_LENGTH = 2;
    static MAX_TRAIL_LENGTH = 15;

    constructor(viewer, context, options) {
        const refinedOptions = Object.assign({
            /* default options */
            projection: 'regular',  // 'regular', 'lambert-conformal-conic'
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

        }, options, {
            trailLength: options.trailLength ? Math.max(Wind.MIN_TRAIL_LENGTH, Math.min(Wind.MAX_TRAIL_LENGTH, options.trailLength)) : 10,   // position buffer length (for position history)
        });
        Object.assign(this, refinedOptions);

        this.viewer = viewer;
        this.context = context;
        const collection = this.primitiveCollection = new Cesium.PrimitiveCollection();     // output primitive collection

        const that = this;

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
        } = this

        const volume = new LonLatAltVolume(boundary, [altitudes[0], altitudes[altitudes.length - 1]])
        this.volume = volume; // save volume for later use

        // convert data into normalized, combined wind speed texture
        const combinedUVWs = [] // 모든 레벨을 하나의 texture로 합침
        altitudes.forEach((level, levelIndex) => {
            // normalize 해서 텍스쳐로 변환
            const UVW = combinedUVWs;
            for (let j = 0; j < dimension[1]; j++) {
                for (let i = 0; i < dimension[0]; i++) {
                    UVW.push((valueMinMax[0][1] - valueMinMax[0][0]) ? (uvws.u[levelIndex][i + j * dimension[0]] - valueMinMax[0][0]) / (valueMinMax[0][1] - valueMinMax[0][0]) : 0.0);
                    UVW.push((valueMinMax[1][1] - valueMinMax[1][0]) ? (uvws.v[levelIndex][i + j * dimension[0]] - valueMinMax[1][0]) / (valueMinMax[1][1] - valueMinMax[1][0]) : 0.0);
                    UVW.push((valueMinMax[2][1] - valueMinMax[2][0]) ? (uvws.w[levelIndex][i + j * dimension[0]] - valueMinMax[2][0]) / (valueMinMax[2][1] - valueMinMax[2][0]) : 0.0);
                    UVW.push(1.0);
                }
            }
        })
        const combinedWindSpeedTextures = this.createTexture({
            context: context,
            width: dimension[0],
            height: dimension[1] * altitudes.length,
            pixelFormat: Cesium.PixelFormat.RGBA,
            pixelDatatype: Cesium.PixelDatatype.FLOAT,
            flipY: false,
            sampler: new Cesium.Sampler({
                // the values of texture will not be interpolated
                minificationFilter: Cesium.TextureMinificationFilter.NEAREST,       // LINEAR 로 자동 보간
                magnificationFilter: Cesium.TextureMagnificationFilter.NEAREST      // LINEAR 로 자동 보간
            }),
        }, new Float32Array(combinedUVWs))
        that.combinedWindSpeedTextures = combinedWindSpeedTextures;

        // wind speed & position
        let windPositionTextures = new Array(trailLength).fill(0).map(() => this.createTexture({
            context: context,
            width: textureSize,
            height: textureSize,
            pixelFormat: Cesium.PixelFormat.RGBA,
            pixelDatatype: Cesium.PixelDatatype.FLOAT,
            flipY: false,
            sampler: new Cesium.Sampler({
                // the values of texture will not be interpolated
                minificationFilter: Cesium.TextureMinificationFilter.NEAREST,       // => LINEAR 로 사용 대체 확인 필요
                magnificationFilter: Cesium.TextureMagnificationFilter.NEAREST      // => LINEAR 로 사용 대체 확인 필요
            }),
        }, new Float32Array(new Array(textureSize * textureSize * 4).fill(0)
            // .map((e, i) => Math.random())
        )))
        const windPosition = new ComputePrimitive({
            fragmentShaderSource: new Cesium.ShaderSource({
                sources: [(that.projection === 'lambert-conformal-conic') ? fragmentShader_calculateWindPosition_lcc : fragmentShader_calculateWindPosition]
            }),
            uniformMap: Object.assign({}, {
                windPositionTexture: function () {
                    return windPositionTextures[1]  // current position
                },
                windSpeedTextures: function () {
                    return combinedWindSpeedTextures;
                },
                dimensions: function () {
                    return new Cesium.Cartesian3(dimension[0], dimension[1], altitudes.length);
                },
                altitudes: function () {
                    return altitudes;
                },
                minValues: function () {
                    return new Cesium.Cartesian3(valueMinMax[0][0], valueMinMax[1][0], valueMinMax[2][0]);
                },
                maxValues: function () {
                    return new Cesium.Cartesian3(valueMinMax[0][1], valueMinMax[1][1], valueMinMax[2][1]);
                },
                velocityMinMax: function () {
                    return that.velocityMinMax ? that.velocityMinMax : [0.0, 0.0];
                },
                bounds: function () {
                    return volume.bounds.map(v => new Cesium.Cartesian3(v[0], v[1], v[2])).slice(0, 4);
                },
                altitudeBounds: function () {
                    return volume.getAltitudeRange();
                },
                speedFactor: function () {
                    return that.speedFactor * that.timeScale;
                },
                randomParam: function () {
                    return Math.random();
                },
                clipping: function () {
                    return that.clipping ? that.clipping : [0.0, 1.0, 0.0, 1.0, 0.0, 1.0];
                },
                // targetValue: function () {
                //     return that.targetValue;
                // },
                filters: function () {
                    return that.filter ? that.filter : [0.0, 1.0, 0.0, 1.0, 0.0, 1.0];
                },
                velocityFilter: function () {
                    return that.velocityFilter ? that.velocityFilter : [0.0, 1.0];
                },
                verticalScale: function () {
                    return that.verticalScale || 1.0; // vertical scale factor for altitude
                },
                wens: function () {
                    return that.wens ? that.wens : [0.0, 360.0, 90.0, 0.0];
                },
                clippingPoints: function () {
                    return (that.clippingPoints ?? [[0, 0, 0], [0, 0, 0]]).map(lonlatalt => new Cesium.Cartesian3(lonlatalt[0], lonlatalt[1], lonlatalt[2]));
                },
            }, (that.projection === 'lambert-conformal-conic') ? {
                // lambertConformalConic
                Lo1: function () {
                    return that.lambertConformalConic.Lo1;
                },
                Lo2: function () {
                    return that.lambertConformalConic.Lo2;
                },
                La1: function () {
                    return that.lambertConformalConic.La1;
                },
                La2: function () {
                    return that.lambertConformalConic.La2;
                },
                Latin1: function () {
                    return that.lambertConformalConic.Latin1;
                },
                Latin2: function () {
                    return that.lambertConformalConic.Latin2;
                },
                center: function () {
                    return new Cesium.Cartesian2(that.lambertConformalConic.center[0], that.lambertConformalConic.center[1]);
                }
            } : {}),
            outputTexture: windPositionTextures[0],     // next position
            preExecute: function (primitive) {
                // swap textures before binding
                that.timeScaleCounter -= 1;
                if (that.timeScaleCounter < 0) {
                    that.timeScaleCounter = that.timeScale;
                    windPositionTextures.unshift(windPositionTextures.pop())
                }


                // keep the outputTexture up to date
                primitive.commandToExecute.outputTexture = windPositionTextures[0];
            }
        })

        const ecefToProjected = this.createRenderingLine(context, windPositionTextures)

        collection.add(windPosition)
        collection.add(ecefToProjected)
    }

    updateParameters(options) {
        Object.assign(this, options);
        // console.log(options);
    }

    updateCustomColorTexture(customColorGrid) {
        // convert data into normalized, combined wind speed texture
        const context = this.context;
        const dimension = customColorGrid.dimensions;
        const altitudes = customColorGrid.altitudes;
        const combinedValues = [] // 모든 레벨을 하나의 texture로 합침
        altitudes.forEach((level, levelIndex) => {
            // normalize 해서 텍스쳐로 변환
            const VALUE = combinedValues;
            for (let j = 0; j < dimension[1]; j++) {
                for (let i = 0; i < dimension[0]; i++) {
                    const v = customColorGrid.values[levelIndex][i + j * dimension[0]];
                    VALUE.push(v);   // 상대 습도의 경우 rawvalue 그대로 넣어줌
                    VALUE.push(v);   // 상대 습도의 경우 rawvalue 그대로 넣어줌
                    VALUE.push(v);   // 상대 습도의 경우 rawvalue 그대로 넣어줌
                    VALUE.push(1.0);
                }
            }
        })
        const combinedTexture = this.createTexture({
            context: context,
            width: dimension[0],
            height: dimension[1] * altitudes.length,
            pixelFormat: Cesium.PixelFormat.RGBA,
            pixelDatatype: Cesium.PixelDatatype.FLOAT,
            flipY: false,
            sampler: new Cesium.Sampler({
                // the values of texture will not be interpolated
                minificationFilter: Cesium.TextureMinificationFilter.NEAREST,       // LINEAR 로 자동 보간
                magnificationFilter: Cesium.TextureMagnificationFilter.NEAREST      // LINEAR 로 자동 보간
            }),
        }, new Float32Array(combinedValues))
        this.customColorTextures = combinedTexture;
    }

    getPrimitiveCollection() {
        return this.primitiveCollection;
    }
    createTexture(options, typedArray) {
        // console.log('createTexture', options, typedArray)
        if (Cesium.defined(typedArray)) {
            // typed array needs to be passed as source option, this is required by Cesium.Texture
            var source = {};
            source.arrayBufferView = typedArray;
            options.source = source;
        }

        var texture = new Cesium.Texture(options);
        return texture;
    }
    getFullscreenQuad() {
        var fullscreenQuad = new Cesium.Geometry({
            attributes: new Cesium.GeometryAttributes({
                position: new Cesium.GeometryAttribute({
                    componentDatatype: Cesium.ComponentDatatype.FLOAT,
                    componentsPerAttribute: 3,
                    //  v3----v2
                    //  |     |
                    //  |     |
                    //  v0----v1
                    values: new Float32Array([
                        -1, -1, 0, // v0
                        1, -1, 0, // v1
                        1, 1, 0, // v2
                        -1, 1, 0, // v3
                    ])
                }),
                st: new Cesium.GeometryAttribute({
                    componentDatatype: Cesium.ComponentDatatype.FLOAT,
                    componentsPerAttribute: 2,
                    values: new Float32Array([
                        0, 0,
                        1, 0,
                        1, 1,
                        0, 1,
                    ])
                })
            }),
            indices: new Uint32Array([3, 2, 0, 0, 2, 1])
        });
        return fullscreenQuad;
    }
    createFramebuffer(context, colorTexture, depthTexture) {
        var framebuffer = new Cesium.Framebuffer({
            context: context,
            colorTextures: [colorTexture],
            depthTexture: depthTexture
        });
        return framebuffer;
    }
    createRawRenderState(options) {
        var translucent = true;
        var closed = false;
        var existing = {
            viewport: options.viewport,
            depthTest: options.depthTest,
            depthMask: options.depthMask,
            blending: options.blending
        };

        var rawRenderState = Cesium.Appearance.getDefaultRenderState(translucent, closed, existing);
        return rawRenderState;
    }

    createPointCloudGeometry(texture) {
        var st = [];
        for (var s = 0; s < texture.width; s++) {
            for (var t = 0; t < texture.height; t++) {
                st.push(s / texture.width);
                st.push(t / texture.height);
            }
        }
        st = new Float32Array(st);

        var geometry = new Cesium.Geometry({
            attributes: new Cesium.GeometryAttributes({
                st: new Cesium.GeometryAttribute({
                    componentDatatype: Cesium.ComponentDatatype.FLOAT,
                    componentsPerAttribute: 2,
                    values: st
                })
            }),
        });
        return geometry;
    }
    createRenderingPoint(context, positionTexture) {
        const that = this;
        return new RenderPrimitive(context, {
            allowPicking: false,
            attributeLocations: {
                st: 1
            },
            geometry: this.createPointCloudGeometry(positionTexture),
            primitiveType: Cesium.PrimitiveType.POINTS,
            uniformMap: Object.assign({}, {
                windSpeedTextures: function () {
                    return that.combinedWindSpeedTextures;
                },
                // color: function () {
                //     return colorTexture;
                // },
                ecefPosition: function () {
                    return positionTexture;
                },
                pointSize: function () {
                    return that.point?.pointSize || 2;
                },
                particleRate: function () {
                    return that.particleRate ?? 1.0; // particle rate for rendering
                },
                colorMode: function () {
                    return that.colorMode === 'windspeed' ? 0 :
                        that.colorMode === 'altitude' ? 1 :
                            that.colorMode === 'relativehumidity' ? 2 :
                                0;
                },
                bounds: function () {
                    return that.volume.bounds.map(v => new Cesium.Cartesian3(v[0], v[1], v[2])).slice(0, 5);
                },
                altitudeBounds: function () {
                    return that.volume.getAltitudeRange();
                },
                verticalScale: function () {
                    return that.verticalScale || 1.0; // vertical scale factor for altitude
                },
                dimensions: function () {
                    return new Cesium.Cartesian3(that.dimension[0], that.dimension[1], that.altitudes.length);
                },
                altitudes: function () {
                    return that.altitudes;
                },
                minValues: function () {
                    return new Cesium.Cartesian3(that.valueMinMax[0][0], that.valueMinMax[1][0], that.valueMinMax[2][0]);
                },
                maxValues: function () {
                    return new Cesium.Cartesian3(that.valueMinMax[0][1], that.valueMinMax[1][1], that.valueMinMax[2][1]);
                },
                altitudeBounds: function () {
                    return that.volume.getAltitudeRange();
                },
                highlights: function () {
                    return that.highlights ?? [];
                },
                customColorTextures: function () {
                    return (that.colorMode === 'relativehumidity') ? (that.customColorTextures || {}) : {}
                },
            }, (that.projection === 'lambert-conformal-conic') ? {
                // lambertConformalConic
                Lo1: function () {
                    return that.lambertConformalConic.Lo1;
                },
                Lo2: function () {
                    return that.lambertConformalConic.Lo2;
                },
                La1: function () {
                    return that.lambertConformalConic.La1;
                },
                La2: function () {
                    return that.lambertConformalConic.La2;
                },
                Latin1: function () {
                    return that.lambertConformalConic.Latin1;
                },
                Latin2: function () {
                    return that.lambertConformalConic.Latin2;
                },
                center: function () {
                    return new Cesium.Cartesian2(that.lambertConformalConic.center[0], that.lambertConformalConic.center[1]);
                }
            } : {}),
            vertexShaderSource: new Cesium.ShaderSource({
                sources: [(that.projection === 'lambert-conformal-conic') ? vertexShader_ecef2projected_point_lcc : vertexShader_ecef2projected_point]
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
    createRenderingLine(context, trailTextures) {
        const that = this;
        return new RenderPrimitive(context, {
            allowPicking: false,
            attributeLocations: {
                st: 1,
                normal: 2,
            },
            geometry: this.createLineStringGeometry(trailTextures),
            primitiveType: Cesium.PrimitiveType.LINES,
            uniformMap: Object.assign({}, {
                windSpeedTextures: function () {
                    return that.combinedWindSpeedTextures;
                },
                trailLength: function () {
                    return trailTextures.length;
                },
                trailECEFPositionTextures: function () {
                    return trailTextures;
                },
                // color: function () {
                //     return colorTexture;
                // },
                particleRate: function () {
                    return that.particleRate ?? 1.0; // particle rate for rendering
                },
                colorMode: function () {
                    return that.colorMode === 'windspeed' ? 0 :
                        that.colorMode === 'altitude' ? 1 :
                            that.colorMode === 'relativehumidity' ? 2 :
                                0;
                },
                bounds: function () {
                    return that.volume.bounds.map(v => new Cesium.Cartesian3(v[0], v[1], v[2])).slice(0, 5);
                },
                altitudeBounds: function () {
                    return that.volume.getAltitudeRange();
                },
                verticalScale: function () {
                    return that.verticalScale || 1.0; // vertical scale factor for altitude
                },
                dimensions: function () {
                    return new Cesium.Cartesian3(that.dimension[0], that.dimension[1], that.altitudes.length);
                },
                altitudes: function () {
                    return that.altitudes;
                },
                minValues: function () {
                    return new Cesium.Cartesian3(that.valueMinMax[0][0], that.valueMinMax[1][0], that.valueMinMax[2][0]);
                },
                maxValues: function () {
                    return new Cesium.Cartesian3(that.valueMinMax[0][1], that.valueMinMax[1][1], that.valueMinMax[2][1]);
                },
                altitudeBounds: function () {
                    return that.volume.getAltitudeRange();
                },
                highlights: function () {
                    return that.highlights ?? [];
                },
                customColorTextures: function () {
                    return (that.colorMode === 'relativehumidity') ? (that.customColorTextures || {}) : {}
                },
            }, (that.projection === 'lambert-conformal-conic') ? {
                // lambertConformalConic
                Lo1: function () {
                    return that.lambertConformalConic.Lo1;
                },
                Lo2: function () {
                    return that.lambertConformalConic.Lo2;
                },
                La1: function () {
                    return that.lambertConformalConic.La1;
                },
                La2: function () {
                    return that.lambertConformalConic.La2;
                },
                Latin1: function () {
                    return that.lambertConformalConic.Latin1;
                },
                Latin2: function () {
                    return that.lambertConformalConic.Latin2;
                },
                center: function () {
                    return new Cesium.Cartesian2(that.lambertConformalConic.center[0], that.lambertConformalConic.center[1]);
                }
            } : {}),
            vertexShaderSource: new Cesium.ShaderSource({
                sources: [(that.projection === 'lambert-conformal-conic') ? vertexShader_ecef2projected_line_lcc : vertexShader_ecef2projected_line]
            }),
            fragmentShaderSource: new Cesium.ShaderSource({
                sources: [fragmentShader_ecef2projected_line]
            }),
            rawRenderState: this.createRawRenderState({
                // viewport: undefined,
                depthTest: {
                    enabled: false,
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
    createRenderingTriangle(viewer, context, trailTextures) {
        const that = this;
        return new RenderPrimitive(context, {
            allowPicking: false,
            attributeLocations: {
                st: 1,
                normal: 2,
            },
            geometry: this.createTriangleGeometry(trailTextures),
            primitiveType: Cesium.PrimitiveType.TRIANGLES,
            uniformMap: Object.assign({}, {
                windSpeedTextures: function () {
                    return that.combinedWindSpeedTextures;
                },
                trailLength: function () {
                    return trailTextures.length;
                },
                trailECEFPositionTextures: function () {
                    return trailTextures;
                },
                // color: function () {
                //     return colorTexture;
                // },
                cameraPosition: function () {
                    console.log(viewer.scene.camera.positionWC)
                    return viewer.scene.camera.positionWC;
                },
                lineWidth: function () {
                    return that.triangle?.lineWidth || 1000.0;
                },
                particleRate: function () {
                    return that.particleRate ?? 1.0; // particle rate for rendering
                },
                colorMode: function () {
                    return that.colorMode === 'windspeed' ? 0 :
                        that.colorMode === 'altitude' ? 1 :
                            that.colorMode === 'relativehumidity' ? 2 :
                                0;
                },
                bounds: function () {
                    return that.volume.bounds.map(v => new Cesium.Cartesian3(v[0], v[1], v[2])).slice(0, 5);
                },
                altitudeBounds: function () {
                    return that.volume.getAltitudeRange();
                },
                verticalScale: function () {
                    return that.verticalScale || 1.0; // vertical scale factor for altitude
                },
                dimensions: function () {
                    return new Cesium.Cartesian3(that.dimension[0], that.dimension[1], that.altitudes.length);
                },
                altitudes: function () {
                    return that.altitudes;
                },
                minValues: function () {
                    return new Cesium.Cartesian3(that.valueMinMax[0][0], that.valueMinMax[1][0], that.valueMinMax[2][0]);
                },
                maxValues: function () {
                    return new Cesium.Cartesian3(that.valueMinMax[0][1], that.valueMinMax[1][1], that.valueMinMax[2][1]);
                },
                altitudeBounds: function () {
                    return that.volume.getAltitudeRange();
                },
                highlights: function () {
                    return that.highlights ?? [];
                },
                customColorTextures: function () {
                    return (that.colorMode === 'relativehumidity') ? (that.customColorTextures || {}) : {}
                },
            }, (that.projection === 'lambert-conformal-conic') ? {
                // lambertConformalConic
                Lo1: function () {
                    return that.lambertConformalConic.Lo1;
                },
                Lo2: function () {
                    return that.lambertConformalConic.Lo2;
                },
                La1: function () {
                    return that.lambertConformalConic.La1;
                },
                La2: function () {
                    return that.lambertConformalConic.La2;
                },
                Latin1: function () {
                    return that.lambertConformalConic.Latin1;
                },
                Latin2: function () {
                    return that.lambertConformalConic.Latin2;
                },
                center: function () {
                    return new Cesium.Cartesian2(that.lambertConformalConic.center[0], that.lambertConformalConic.center[1]);
                }
            } : {}),
            vertexShaderSource: new Cesium.ShaderSource({
                sources: [(that.projection === 'lambert-conformal-conic') ? vertexShader_ecef2projected_triangle_lcc : vertexShader_ecef2projected_triangle]
            }),
            fragmentShaderSource: new Cesium.ShaderSource({
                sources: [fragmentShader_ecef2projected_triangle]
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
            autoClear: false,
        })
    }

    createLineStringGeometry(textures) {
        const lineLength = textures.length;
        const texture = textures[0];

        var st = [];
        {
            for (let s = 0; s < texture.width; s++) {
                for (let t = 0; t < texture.height; t++) {
                    for (let i = 0; i < lineLength; i++) {
                        st.push(s / texture.width);
                        st.push(t / texture.height);
                    }
                }
            }
            st = new Float32Array(st);
        }

        var normal = [];
        {
            for (let s = 0; s < texture.width; s++) {
                for (let t = 0; t < texture.height; t++) {
                    for (let i = 0; i < lineLength; i++) {
                        normal.push(i); // trail index
                        normal.push(0); // trail order
                        normal.push(0); // unused
                    }
                }
            }
            normal = new Float32Array(normal);
        }

        const indexSize = (lineLength - 1) * texture.width * texture.height * 2;
        let vIndex = 0;
        var vertexIndexes = new Uint32Array(indexSize);
        {
            for (let particleIndex = 0; particleIndex < texture.width * texture.height; particleIndex++) {
                // for each particle,
                let startVertexIndex = particleIndex * (lineLength);

                for (let j = 0; j < lineLength - 1; j++) {
                    vertexIndexes[vIndex++] = startVertexIndex + j;
                    vertexIndexes[vIndex++] = startVertexIndex + j + 1;
                }
            }
        }

        var geometry = new Cesium.Geometry({
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
            indices: vertexIndexes
        });

        return geometry;
    }
    createTriangleGeometry(textures) {
        const lineLength = textures.length;
        const texture = textures[0];

        var st = [];
        {
            for (let s = 0; s < texture.width; s++) {
                for (let t = 0; t < texture.height; t++) {
                    for (let i = 0; i < lineLength; i++) {
                        // for each line, use 2 vertex
                        st.push(s / texture.width);
                        st.push(t / texture.height);

                        st.push(s / texture.width);
                        st.push(t / texture.height);
                    }
                }
            }
            st = new Float32Array(st);
        }

        var normal = [];
        {
            for (let s = 0; s < texture.width; s++) {
                for (let t = 0; t < texture.height; t++) {
                    for (let i = 0; i < lineLength; i++) {
                        normal.push(i); // trail index
                        normal.push(1); // vertex index
                        normal.push(0); // unused

                        normal.push(i); // trail index
                        normal.push(-1); // vertex index
                        normal.push(0); // unused
                    }
                }
            }
            normal = new Float32Array(normal);
        }

        const indexSize = (lineLength - 1) * texture.width * texture.height * 3 * 2; // line 하나당 triangle 2개씩 필요
        let vIndex = 0;
        var vertexIndexes = new Uint32Array(indexSize);
        {
            for (let particleIndex = 0; particleIndex < texture.width * texture.height; particleIndex++) {

                let startVertexIndex = particleIndex * (lineLength) * 2;

                for (let j = 0; j < lineLength - 1; j++) {
                    vertexIndexes[vIndex++] = startVertexIndex + j;
                    vertexIndexes[vIndex++] = startVertexIndex + j + 1;
                    vertexIndexes[vIndex++] = startVertexIndex + j + 2;

                    vertexIndexes[vIndex++] = startVertexIndex + j + 2;
                    vertexIndexes[vIndex++] = startVertexIndex + j + 1;
                    vertexIndexes[vIndex++] = startVertexIndex + j + 3;
                }
            }
        }

        var geometry = new Cesium.Geometry({
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
            indices: vertexIndexes
        });

        return geometry;
    }


}





