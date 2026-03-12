in vec2 st;
in vec3 normal;

uniform int trailLength;
uniform sampler2D trailECEFPositionTextures[15];
uniform vec3 bounds[4];
uniform float altitudeBounds[2];
uniform float verticalScale;


out vec2 textureCoordinate;
out float repositioned;
out vec3 positionWC;
out vec3 normalizedPosition;

vec3 denomalize(vec3 normalizedXYZ) {
    vec3 bottomBack = mix(bounds[0], bounds[1], normalizedXYZ.x);
    vec3 bottomFront = mix(bounds[3], bounds[2], normalizedXYZ.x);
    vec3 bottom = mix(bottomBack, bottomFront, normalizedXYZ.y);

    float altitude = mix(altitudeBounds[0], altitudeBounds[1], normalizedXYZ.z);

    vec3 result = vec3(bottom.xy, altitude);
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