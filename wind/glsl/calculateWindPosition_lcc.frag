// uniforms
uniform sampler2D windPositionTexture;
uniform sampler2D windSpeedTextures;
uniform vec3 dimensions;
uniform float altitudes[30];
uniform vec3 minValues;
uniform vec3 maxValues;
uniform float velocityMinMax[2];
uniform vec3 bounds[4];
uniform float altitudeBounds[2];
uniform float wens[4];
uniform vec3 clippingPoints[2];

// parameters
uniform float speedFactor;
uniform float randomParam;
uniform float clipping[6];
uniform float targetValue;
uniform float filters[6];
uniform float velocityFilter[2];

// Lambert Conformal Coninc 프로젝션용 Uniform
uniform float Lo1;
uniform float Lo2;
uniform float La1;
uniform float La2;
uniform float Lov;
uniform float Latin1;
uniform float Latin2;
uniform vec2 center;

// inout
in vec2 v_textureCoordinates;
out vec4 fragColor_1;

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
vec2 normalizeLcc(vec2 lccPos) {
    // lcc 프로젝션 상의 위치

    // lcc 프로젝션 상에서의 바운더리 계산
    vec2 SW = lccTransform(vec2(Lo1, La1));
    vec2 NE = lccTransform(vec2(Lo2, La2));

    // 평면 좌표에서의 최소/최대값 (실제 응용에서는 네 모서리 모두 고려할 수 있음)
    float x_min = SW.x;
    float x_max = NE.x;
    float y_min = SW.y;
    float y_max = NE.y;

    // 3. 정규화 (0~1 사이 값)
    float norm_x = (lccPos.x - x_min) / (x_max - x_min);
    float norm_y = (lccPos.y - y_min) / (y_max - y_min);

    return vec2(norm_x, norm_y);
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

vec3 denomalize(vec3 normalizedXYZ) {
    vec2 lonlat = lccInverseTransform(denormalizeLcc(normalizedXYZ.xy));
    
    float altitude = mix(altitudeBounds[0], altitudeBounds[1], normalizedXYZ.z);

    vec3 result = vec3(lonlat.xy, altitude);
    return result;
}

// given a point p and a quad defined by four points {a,b,c,d}, return the bilinear
// coordinates of p in the quad. Will not be in the range [0..1]^2 if the point is
// outside the quad.
float cross2d(in vec2 a, in vec2 b) {
    return a.x * b.y - a.y * b.x;
}
vec2 invBilinear(vec2 p, vec3 quad[4]) {
    vec2 a = quad[0].xy;
    vec2 b = quad[1].xy;
    vec2 c = quad[2].xy;
    vec2 d = quad[3].xy;

    vec2 res = vec2(-1.0);

    vec2 e = b - a;
    vec2 f = d - a;
    vec2 g = a - b + c - d;
    vec2 h = p - a;

    float k2 = cross2d(g, f);
    float k1 = cross2d(e, f) + cross2d(h, g);
    float k0 = cross2d(h, e);

    // if edges are parallel, this is a linear equation
    if(abs(k2) < 0.001) {
        res = vec2((h.x * k1 + f.x * k0) / (e.x * k1 - g.x * k0), -k0 / k1);
    }
    // otherwise, it's a quadratic
    else {
        float w = k1 * k1 - 4.0 * k0 * k2;
        if(w < 0.0)
            return vec2(-1.0);
        w = sqrt(w);

        float ik2 = 0.5 / k2;
        float v = (-k1 - w) * ik2;
        float u = (h.x - f.x * v) / (e.x + g.x * v);

        if(u < 0.0 || u > 1.0 || v < 0.0 || v > 1.0) {
            v = (-k1 + w) * ik2;
            u = (h.x - f.x * v) / (e.x + g.x * v);
        }
        res = vec2(u, v);
    }

    return res;
}

vec2 lengthOfLonLat(vec3 lonLatLev) {
    // unit conversion: meters -> longitude latitude degrees
    // see https://en.wikipedia.org/wiki/Geographic_coordinate_system#Length_of_a_degree for detail

    // Calculate the length of a degree of latitude and longitude in meters
    float latitude = radians(lonLatLev.y);

    float term1 = 111132.92;
    float term2 = 559.82 * cos(2.0 * latitude);
    float term3 = 1.175 * cos(4.0 * latitude);
    float term4 = 0.0023 * cos(6.0 * latitude);
    float latLength = term1 - term2 + term3 - term4;

    float term5 = 111412.84 * cos(latitude);
    float term6 = 93.5 * cos(3.0 * latitude);
    float term7 = 0.118 * cos(5.0 * latitude);
    float longLength = term5 - term6 + term7;

    return vec2(longLength, latLength);
}

vec3 convertSpeedUnitToLonLat(vec3 lonLatLev, vec3 speed) {
    vec2 lonLatLength = lengthOfLonLat(lonLatLev);
    float u = speed.x / lonLatLength.x;
    float v = speed.y / lonLatLength.y;
    float w = speed.z;  // altitude itself is altitude in meter unit
    vec3 windVectorInLonLatLev = vec3(u, v, w);

    return windVectorInLonLatLev;
}

vec3 calculateNextPosition(vec3 lonlatalt, vec3 speed) {
    vec3 speedInLonLat = convertSpeedUnitToLonLat(lonlatalt, speed);    // lla

    vec3 movedLonlatalt = lonlatalt + speedInLonLat;

    vec2 uv = normalizeLcc(lccTransform(movedLonlatalt.xy));// invBilinear(movedLonlatalt.xy, bounds);

    if(uv.x == -1.0 || uv.y == -1.0)
        return vec3(0.0);

    float boundaryAltitudeSize = (altitudeBounds[1] - altitudeBounds[0]);
    vec3 movedUVW = vec3(uv, (boundaryAltitudeSize == 0.0) ? 0.5 : ((movedLonlatalt.z - altitudeBounds[0]) / (altitudeBounds[1] - altitudeBounds[0])));

    return movedUVW;
}

// pseudo-random generator
const float randomCoefficient = 1.0;
const vec3 randomConstants = vec3(12.9898, 78.233, 435.85453);
float rand(vec2 seed, vec2 range) {
    vec2 randomSeed = randomCoefficient * seed;
    float temp = dot(randomConstants.xy, randomSeed) * randomParam;
    temp = fract(sin(temp) * (randomConstants.z + temp));
    return temp * (range.y - range.x) + range.x;
}

vec3 generateRandomParticle(vec2 seed) {
    // ensure the longitude is in [0, 360]
    //float randomLon = mod(rand(seed, vec2(minimum.x, maximum.x)), 360.0);
    float randomLon = rand(seed, vec2(clipping[0], clipping[1]));
    float randomLat = rand(-seed, vec2(clipping[2], clipping[3]));
    float randomAlt = rand(-seed * seed, vec2(clipping[4], clipping[5]));//(maximum.z+minimum.z)/2.0;//rand(seed*seed, vec2(minimum.z, maximum.z));

    return vec3(randomLon, randomLat, randomAlt);
}

vec3 sampleWindSpeedAtLevel(int levelIndex, vec2 normalizedPosition) {
    float vSizePerLevel = (1.0 / dimensions.z);
    vec2 cellSizeInLevel = vec2((1.0 / (dimensions.x - 1.0)), (1.0 / (dimensions.y - 1.0)));

    vec2 cellStart = cellSizeInLevel * floor(normalizedPosition / cellSizeInLevel);
    vec2 frag = (normalizedPosition.xy - cellStart) / cellSizeInLevel;
    vec2 cellEnd = cellStart + cellSizeInLevel;

    vec2 levelStart = vec2(0.0, vSizePerLevel * float(levelIndex));
    vec2 levelEnd = vec2(1.0, vSizePerLevel * float(levelIndex + 1) - vSizePerLevel / (dimensions.y));  // for clamping
    vec2 toGlobalSize = vec2(1.0, vSizePerLevel);
    vec2 globalStart = clamp(cellStart * toGlobalSize + levelStart, levelStart, levelEnd);
    vec2 globalEnd = clamp(cellEnd * toGlobalSize + levelStart, levelStart, levelEnd);

    vec3 lb = texture(windSpeedTextures, vec2(globalStart.x, globalStart.y)).xyz;
    vec3 rb = texture(windSpeedTextures, vec2(globalEnd.x, globalStart.y)).xyz;
    vec3 lt = texture(windSpeedTextures, vec2(globalStart.x, globalEnd.y)).xyz;
    vec3 rt = texture(windSpeedTextures, vec2(globalEnd.x, globalEnd.y)).xyz;

    vec3 b = mix(lb, rb, frag.x);
    vec3 t = mix(lt, rt, frag.x);
    vec3 r = mix(b, t, frag.y);

    return r;
}

vec3 getWindSpeedAt(vec3 normalizedPosition) {
    int lowLevelIndex = -1;
    int highLevelIndex = -1;

    float boundaryAltitudeSize = (altitudeBounds[1] - altitudeBounds[0]);
    float altitude = (boundaryAltitudeSize == 0.0) ? altitudeBounds[1] : (normalizedPosition.z * (altitudeBounds[1] - altitudeBounds[0]) + altitudeBounds[0]);

    int levels = int(dimensions.z);
    for(int i = 0; i < levels; i++) {
        if(altitudes[i] >= altitude) {
            if(highLevelIndex == -1)
                highLevelIndex = i;
            else if(altitudes[highLevelIndex] >= altitudes[i])
                highLevelIndex = i;
        }
        if(altitudes[i] <= altitude) {
            if(lowLevelIndex == -1)
                lowLevelIndex = i;
            else if(altitudes[lowLevelIndex] <= altitudes[i])
                lowLevelIndex = i;
        }
    }

    if(lowLevelIndex == -1 || highLevelIndex == -1)
        return vec3(-1.0);       // should not excute

    vec3 normalizedWindSpeed = vec3(0.0);
    if(lowLevelIndex == highLevelIndex) {
        normalizedWindSpeed = sampleWindSpeedAtLevel(lowLevelIndex, normalizedPosition.xy);
    } else {
        vec3 low = sampleWindSpeedAtLevel(lowLevelIndex, normalizedPosition.xy);
        vec3 high = sampleWindSpeedAtLevel(highLevelIndex, normalizedPosition.xy);

        float ratio = (altitude - altitudes[lowLevelIndex]) / (altitudes[highLevelIndex] - altitudes[lowLevelIndex]);
        normalizedWindSpeed = low + (high - low) * ratio;
    }

    vec3 realWindSpeed = minValues + normalizedWindSpeed * (maxValues - minValues);
    if(maxValues.x == minValues.x)
        realWindSpeed.x = maxValues.x;
    if(maxValues.y == minValues.y)
        realWindSpeed.y = maxValues.y;
    if(maxValues.z == minValues.z)
        realWindSpeed.z = maxValues.z;
    return realWindSpeed;
}

bool checkOutBounds(vec3 normalizedPosition) {
    if(normalizedPosition.x <= 0.005 || normalizedPosition.x >= 0.995)
        return true;
    if(normalizedPosition.y <= 0.005 || normalizedPosition.y >= 0.995)
        return true;
    float boundaryAltitudeSize = (altitudeBounds[1] - altitudeBounds[0]);
    if(boundaryAltitudeSize == 0.0 && (normalizedPosition.z <= 0.0 || normalizedPosition.z >= 0.2))    // 단일면 데이터를 위해
        return true;

    if(normalizedPosition.x < clipping[0] || normalizedPosition.x > clipping[1])
        return true;
    if(normalizedPosition.y < clipping[2] || normalizedPosition.y > clipping[3])
        return true;
    if(boundaryAltitudeSize > 0.0 && normalizedPosition.z < clipping[4] || normalizedPosition.z > clipping[5])
        return true;

    return false;
}

bool checkOutFilters(vec3 speed) {
    // vec3 realWindSpeed = minValues + normalizedWindSpeed * (maxValues - minValues);
    // if(maxValues.x == minValues.x)
    //     realWindSpeed.x = maxValues.x;
    // if(maxValues.y == minValues.y)
    //     realWindSpeed.y = maxValues.y;
    // if(maxValues.z == minValues.z)
    //     realWindSpeed.z = maxValues.z;
    // return realWindSpeed;

    vec3 normalizedWindSpeed = (speed - minValues) / (maxValues - minValues);

    if(normalizedWindSpeed.x < filters[0] || normalizedWindSpeed.x > filters[1])
        return true;
    if(normalizedWindSpeed.y < filters[2] || normalizedWindSpeed.y > filters[3])
        return true;
    if(normalizedWindSpeed.z < filters[4] || normalizedWindSpeed.z > filters[5])
        return true;

    return false;
}

bool checkOutVelocityFilter(vec3 speed) {
    float velocity = length(speed);
    float normalizedWindSpeed = (velocity - velocityMinMax[0]) / (velocityMinMax[1] - velocityMinMax[0]);
    if(normalizedWindSpeed < velocityFilter[0] || normalizedWindSpeed > velocityFilter[1])
        return true;

    return false;
}

bool checkWENS(vec3 lonlatalt) {
    if(lonlatalt.x < wens[0] || lonlatalt.x > wens[1])
        return true;
    if(lonlatalt.y > wens[2] || lonlatalt.y < wens[3])
        return true;
    return false;
}

bool checkOutOfClippingLine(vec3 llaA, vec3 llaB, vec3 llaC) {
    if(length(llaA) == 0.0 || length(llaB) == 0.0)
        return false;

    // Convert LLA to ECEF
    vec3 a = llaA;///llaToECEF(llaA);
    vec3 b = llaB;///llaToECEF(llaB);
    vec3 c = llaC;///llaToECEF(llaC);

    // Calculate vectors in ECEF
    vec3 ab = b - a;
    vec3 ac = c - a;

    // Cross product in ECEF
    vec3 crossProduct = cross(ab, ac);

    // Use the z-component of the cross product to determine left/right
    return crossProduct.z > 0.0; // true: left, false: right
}

void main() {

    vec2 particleIndex = v_textureCoordinates;

    float repositioned = 0.0;
    bool shouldReposition = false;

    // random particle reset
    vec2 seed = particleIndex;
    float random = rand(seed, vec2(0.0, 1.0));
    shouldReposition = random > 0.999;
    if(shouldReposition) {
        // reposition to random p inside volume
        vec3 randomPosition = generateRandomParticle(particleIndex);
        repositioned = 1.0;
        fragColor_1 = vec4(randomPosition, repositioned);
        return;   
    }

    // calculate particle speed
    vec3 normalizedPosition = texture(windPositionTexture, particleIndex).xyz;
    vec3 speed = getWindSpeedAt(normalizedPosition);

    shouldReposition = checkOutVelocityFilter(speed) || checkOutFilters(speed);
    if(shouldReposition) {
        // reposition to random p inside volume
        vec3 randomPosition = generateRandomParticle(particleIndex);
        repositioned = 1.0;
        fragColor_1 = vec4(randomPosition, repositioned);
        return;   
    }

    // 
    vec3 lonlatalt = denomalize(normalizedPosition);    // lla

    // 꼬마이 영상에서 입자 고도가 적용 안된버전 예쁘게 보임 z를 0.0
    vec3 adjustedSpeed = vec3(speed.x * speedFactor, speed.y * speedFactor, 0.0);
    vec3 movedNormalizedPosition = calculateNextPosition(lonlatalt, adjustedSpeed);

    //입자 고도 적용된 버전
    //vec3 movedNormalizedPosition = calculateNextPosition(lonlatalt, speed * speedFactor);


    vec3 clampedNormalized = clamp(movedNormalizedPosition, vec3(0.0), vec3(1.0));

    shouldReposition = checkOutBounds(clampedNormalized) || checkWENS(lonlatalt);
    if(shouldReposition) {
        // reposition to random p inside volume
        vec3 randomPosition = generateRandomParticle(particleIndex);
        repositioned = 1.0;
        fragColor_1 = vec4(randomPosition, repositioned);
        return;   
    }

    if(clippingPoints[0] != vec3(0.0) && checkOutOfClippingLine(clippingPoints[0], clippingPoints[1], lonlatalt)) {
        vec3 randomPosition = generateRandomParticle(particleIndex);
        repositioned = 1.0;
        fragColor_1 = vec4(randomPosition, repositioned);
        return;
    }

    // normalized clamped position
    fragColor_1 = vec4(clampedNormalized, repositioned);
}
