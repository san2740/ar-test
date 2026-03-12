in vec2 st;

uniform sampler2D ecefPosition;
uniform float pointSize;
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

    vec3 currentPosition = texture(ecefPosition, particleIndex).rgb;
    repositioned = texture(ecefPosition, particleIndex).a;

    vec3 lonlatalt = denomalize(currentPosition);
    vec3 ecef = convertCoordinate(vec3(lonlatalt.x, lonlatalt.y, lonlatalt.z * verticalScale));

    normalizedPosition = currentPosition;
    positionWC = ecef;
    gl_Position = czm_viewProjection * vec4(ecef, 1.0);
    gl_PointSize = pointSize;
}