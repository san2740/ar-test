
export default class ComputePrimitive {
    constructor(options) {
        Object.assign(this, options);
        // this.uniformMap = options.uniformMap;
        // this.fragmentShaderSource = options.fragmentShaderSource;
        // this.outputTexture = options.outputTexture;

        this.commandToExecute = this.createCommand();
    }

    createCommand() {
        return new Cesium.ComputeCommand({
            owner: this,
            fragmentShaderSource: this.fragmentShaderSource,
            uniformMap: this.uniformMap,
            outputTexture: this.outputTexture,
            persists: true
        });
    }

    update(frameState) {
        if (Cesium.defined(this.preExecute)) {
            this.preExecute(this);
        }

        if (Cesium.defined(this.clearCommand)) {
            frameState.commandList.push(this.clearCommand);
        }
        frameState.commandList.push(this.commandToExecute);
    }

    destroy() {
        if (Cesium.defined(this.commandToExecute)) {
            this.commandToExecute.shaderProgram = this.commandToExecute.shaderProgram && this.commandToExecute.shaderProgram.destroy();
        }
        return Cesium.destroyObject(this);
    }

}
