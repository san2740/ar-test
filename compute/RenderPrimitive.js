export default class RenderPrimitive {
    show = true;

    constructor(context, options) {
        Object.assign(this, options);
        // this.geometry = options.geometry;
        // this.attributeLocations = options.attributeLocations;
        // this.primitiveType = options.primitiveType;
        // this.uniformMap = options.uniformMap;
        // this.vertexShaderSource = options.vertexShaderSource;
        // this.fragmentShaderSource = options.fragmentShaderSource;
        // this.framebuffer = options.framebuffer;

        this.context = context;
        // this.framebuffer = new Cesium.Framebuffer({
        //     context: context,
        //     colorTextures: [colorTexture],
        //     depthTexture: depthTexture
        // });
        this.commandToExecute = this.createCommand(context);
        this.clearCommand = undefined;
        if (this.autoClear) {
            this.clearCommand = new Cesium.ClearCommand({
                color: new Cesium.Color(0.0, 0.0, 0.0, 0.0),
                depth: 1.0,
                framebuffer: this.framebuffer,
                pass: Cesium.Pass.OPAQUE
            });
        }
    }

    createCommand(context) {
        var vertexArray = Cesium.VertexArray.fromGeometry({
            context: context,
            geometry: this.geometry,
            attributeLocations: this.attributeLocations,
            bufferUsage: Cesium.BufferUsage.STATIC_DRAW,
        });

        var shaderProgram = Cesium.ShaderProgram.fromCache({
            context: context,
            attributeLocations: this.attributeLocations,
            vertexShaderSource: this.vertexShaderSource,
            fragmentShaderSource: this.fragmentShaderSource
        });

        var renderState = Cesium.RenderState.fromCache(this.rawRenderState);
        return new Cesium.DrawCommand({
            owner: this,
            vertexArray: vertexArray,
            primitiveType: this.primitiveType,
            uniformMap: this.uniformMap,
            modelMatrix: Cesium.Matrix4.IDENTITY,
            shaderProgram: shaderProgram,
            framebuffer: this.framebuffer,
            renderState: renderState,
            pass: Cesium.Pass.OPAQUE
        });
    }

    update(frameState) {
        if (!this.show) {
            return;
        }

        if (Cesium.defined(this.preExecute)) {
            this.preExecute();
        }

        if (Cesium.defined(this.clearCommand)) {
            frameState.commandList.push(this.clearCommand);
        }
        frameState.commandList.push(this.commandToExecute);
    }

    isDestroyed() {
        return false;
    }

    destroy() {
        if (Cesium.defined(this.commandToExecute)) {
            this.commandToExecute.shaderProgram = this.commandToExecute.shaderProgram && this.commandToExecute.shaderProgram.destroy();
        }
        return Cesium.destroyObject(this);
    }

}
