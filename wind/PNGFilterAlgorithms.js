
const QuantizeSteps = 100000;   // 반드시 서버 설정값과 동일해야 함

export default function revokeSubFilterAndDequantization(ary, minmax) {
    const revokeSubFilter = new Array(ary.length).fill(0);
    for (let z = 0; z < revokeSubFilter.length; z++) {
        revokeSubFilter[z] = (z === 0) ? ary[z] : (ary[z] + revokeSubFilter[z - 1])
    }
    // dequantization
    return revokeSubFilter.map(quantized => minmax[0] + (quantized / (QuantizeSteps - 1)) * (minmax[1] - minmax[0]));
}