in vec2 st;
in vec3 normal;

uniform int trailLength;
uniform sampler2D trailECEFPositionTextures[15];
uniform vec3 bounds[4];
uniform float altitudeBounds[2];
uniform float verticalScale;

// Lambert Conformal Coninc 프로젝션용 Uniform
uniform float Lo1;
uniform float Lo2;
uniform float La1;
uniform float La2;
uniform float Lov;
uniform float Latin1;
uniform float Latin2;
uniform vec2 center;


out vec2 textureCoordinate;
out float repositioned;
out vec3 positionWC;
out vec3 normalizedPosition;

const float PI = 3.1415926535897932384626433832795;

// KAS 모델 Lambert Conformal Coninc 프로젝션용 상수
// const float Lo1 = 110.6207962; // lon of SW
// const float Lo2 = 148.0289001; // lon of NE
// const float La1 = 25.25532913; // lat of SW
// const float La2 = 47.67061996; // lat of NE
// const float Lov = 126.0;    // 기준경도
// const float Latin1 = 30.0;  // 기준 위도1
// const float Latin2 = 60.0;  // 기준 위도2
// const vec2 center = vec2(126.0, 38.0);

vec2 lccTransform(vec2 lonLat) {
    // Lon, Lat을 lcc 좌표로 변환
    // 모든 각도를 라디안으로 변환
    float lambda = radians(lonLat.x);
    float phi = radians(lonLat.y);

    // params
    float phi1 = radians(Latin1);       // 기준 위도 1
    float phi2 = radians(Latin2);       // 기준 위도 2
    float phi0 = radians(center.y);     // 프로젝션 중심점 위도
    float lambda0 = radians(center.x);  // 프로젝션 중심점 경도
    float E0 = 0.0;
    float N0 = 0.0;

    // n 계산
    float n = log(cos(phi1) / cos(phi2)) /
        log(tan(PI / 4.0 + phi2 / 2.0) / tan(PI / 4.0 + phi1 / 2.0));

    // F 계산
    float F = (cos(phi1) * pow(tan(PI / 4.0 + phi1 / 2.0), n)) / n;

    // ρ (rho) 및 ρ0 (rho0) 계산
    float rho = F / pow(tan(PI / 4.0 + phi / 2.0), n);
    float rho0 = F / pow(tan(PI / 4.0 + phi0 / 2.0), n);

    // 평면 좌표 (x, y) 계산
    float x = rho * sin(n * (lambda - lambda0)) + E0;
    float y = rho0 - rho * cos(n * (lambda - lambda0)) + N0;

    return vec2(x, y);
}
vec2 denormalizeLcc(vec2 norm) {
    // lcc 프로젝션 상에서의 바운더리 계산
    vec2 SW = lccTransform(vec2(Lo1, La1));
    vec2 NE = lccTransform(vec2(Lo2, La2));

    // 평면 좌표에서의 최소/최대값 (실제 응용에서는 네 모서리 모두 고려할 수 있음)
    float x_min = SW.x;
    float x_max = NE.x;
    float y_min = SW.y;
    float y_max = NE.y;

    vec2 lcc = vec2(x_min + (x_max - x_min) * norm.x, y_min + (y_max - y_min) * norm.y);
    return lcc;
}

vec2 lccInverseTransform(vec2 lcc) {
    // lcc를 Lon,Lat으로 변환
    float phi1 = radians(Latin1);       // 기준 위도 1
    float phi2 = radians(Latin2);       // 기준 위도 2
    float phi0 = radians(center.y);     // 프로젝션 중심점 위도
    float lambda0 = radians(center.x);  // 프로젝션 중심점 경도
    float E0 = 0.0;
    float N0 = 0.0;

  // forward transform과 동일한 방식으로 n, F, rho0 계산
    float n = log(cos(phi1) / cos(phi2)) /
        log(tan(PI / 4.0 + phi2 / 2.0) / tan(PI / 4.0 + phi1 / 2.0));
    float F = (cos(phi1) * pow(tan(PI / 4.0 + phi1 / 2.0), n)) / n;
    float rho0 = F / pow(tan(PI / 4.0 + phi0 / 2.0), n);

  // False Easting/Northing 제거
    float dx = lcc.x - E0;
    float dy = rho0 - (lcc.y - N0);

    float rho = sqrt(dx * dx + dy * dy);
    float theta = atan(dx, dy); // atan2(dx, dy) 사용
    float lambda = lambda0 + theta / n;

  // 위도 복원: tan(π/4 + φ/2) = (F / rho)^(1/n)
    float t = pow(F / rho, 1.0 / n);
    float phi = 2.0 * atan(t) - PI / 2.0;

    return vec2(degrees(lambda), degrees(phi));
}

vec3 denomalize(vec3 normalizedXYZ) {
    vec2 lonlat = lccInverseTransform(denormalizeLcc(normalizedXYZ.xy));
    
    float altitude = mix(altitudeBounds[0], altitudeBounds[1], normalizedXYZ.z);

    vec3 result = vec3(lonlat.xy, altitude);
    return result;
}

vec3 convertCoordinate(vec3 lonLatLev) {
    // WGS84 (lon, lat, lev) -> ECEF (x, y, z)
    // read https://en.wikipedia.org/wiki/Geographic_coordinate_conversion#From_geodetic_to_ECEF_coordinates for detail

    // WGS 84 geometric constants 
    float a = 6378137.0; // Semi-major axis 
    float b = 6356752.3142; // Semi-minor axis 
    float e2 = 6.69437999014e-3; // First eccentricity squared

    float latitude = radians(lonLatLev.y);
    float longitude = radians(lonLatLev.x);
    float altitude = lonLatLev.z;

    float cosLat = cos(latitude);
    float sinLat = sin(latitude);
    float cosLon = cos(longitude);
    float sinLon = sin(longitude);

    float N_Phi = a / sqrt(1.0 - e2 * sinLat * sinLat);

    vec3 cartesian = vec3(0.0);
    cartesian.x = (N_Phi + altitude) * cosLat * cosLon;
    cartesian.y = (N_Phi + altitude) * cosLat * sinLon;
    cartesian.z = ((1.0 - e2) * N_Phi + altitude) * sinLat;   //((b * b) / (a * a) * N_Phi + h) * sinLat;
    return cartesian;
}

void main() {
    vec2 particleIndex = textureCoordinate = st;

    vec4 trails[15];

    int trailIndex = int(normal.x);
    for(int i = trailIndex; i <= trailIndex; i++) {
        if(i == 0)
            trails[i] = texture(trailECEFPositionTextures[0], particleIndex).rgba;
        if(i == 1)
            trails[i] = texture(trailECEFPositionTextures[1], particleIndex).rgba;
        if(i == 2)
            trails[i] = texture(trailECEFPositionTextures[2], particleIndex).rgba;
        if(i == 3)
            trails[i] = texture(trailECEFPositionTextures[3], particleIndex).rgba;
        if(i == 4)
            trails[i] = texture(trailECEFPositionTextures[4], particleIndex).rgba;
        if(i == 5)
            trails[i] = texture(trailECEFPositionTextures[5], particleIndex).rgba;
        if(i == 6)
            trails[i] = texture(trailECEFPositionTextures[6], particleIndex).rgba;
        if(i == 7)
            trails[i] = texture(trailECEFPositionTextures[7], particleIndex).rgba;
        if(i == 8)
            trails[i] = texture(trailECEFPositionTextures[8], particleIndex).rgba;
        if(i == 9)
            trails[i] = texture(trailECEFPositionTextures[9], particleIndex).rgba;
        if(i == 10)
            trails[i] = texture(trailECEFPositionTextures[10], particleIndex).rgba;
        if(i == 11)
            trails[i] = texture(trailECEFPositionTextures[11], particleIndex).rgba;
        if(i == 12)
            trails[i] = texture(trailECEFPositionTextures[12], particleIndex).rgba;
        if(i == 13)
            trails[i] = texture(trailECEFPositionTextures[13], particleIndex).rgba;
        if(i == 14)
            trails[i] = texture(trailECEFPositionTextures[14], particleIndex).rgba;
    }

    vec3 currentPosition = trails[trailIndex].rgb;
    repositioned = trails[trailIndex].a;//max(trails[trailIndex].a, trails[trailIndex + 1].a);
    
    vec3 lonlatalt = denomalize(currentPosition);
    vec3 ecef = convertCoordinate(vec3(lonlatalt.x, lonlatalt.y, lonlatalt.z * verticalScale));

    normalizedPosition = currentPosition;
    positionWC = ecef;
    gl_Position = czm_viewProjection * vec4(ecef, 1.0);
}