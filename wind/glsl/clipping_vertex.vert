precision highp float;

uniform vec3 dimensions;
uniform float altitudes[33];
uniform vec3 bounds[4];
uniform float altitudeBounds[2];
uniform float verticalScale;
uniform vec3 clippingPoints[2];
uniform float wens[4];

in vec2 st;
in vec3 normal;

out vec2 textureCoordinate;
out vec3 npos;

float cross2d(in vec2 a, in vec2 b) { return a.x * b.y - a.y * b.x; }

vec2 invBilinear(in vec2 p, in vec3 quad[4]) {
    vec2 a = quad[0].xy, b = quad[1].xy, c = quad[2].xy, d = quad[3].xy;
    vec2 e = b - a;
    vec2 f = d - a;
    vec2 g = a - b + c - d;
    vec2 h = p - a;

    float k2 = cross2d(g, f);
    float k1 = cross2d(e, f) + cross2d(h, g);
    float k0 = cross2d(h, e);

    if (abs(k2) < 0.001) {
        return vec2((h.x * k1 + f.x * k0) / (e.x * k1 - g.x * k0), -k0 / k1);
    } else {
        float w = k1 * k1 - 4.0 * k0 * k2;
        if (w < 0.0) return vec2(-1.0);
        w = sqrt(w);

        float ik2 = 0.5 / k2;
        float v = (-k1 - w) * ik2;
        float u = (h.x - f.x * v) / (e.x + g.x * v);

        if (u < 0.0 || u > 1.0 || v < 0.0 || v > 1.0) {
            v = (-k1 + w) * ik2;
            u = (h.x - f.x * v) / (e.x + g.x * v);
        }
        return vec2(u, v);
    }
}

// 음수 lon이 있으면 [-180,180] 계열로 간주
bool boundsUse180(in vec3 quad[4]) {
    return (quad[0].x < 0.0) || (quad[1].x < 0.0) || (quad[2].x < 0.0) || (quad[3].x < 0.0);
}

float unwrapLonNear(float lon, float refLon) {
    float d = lon - refLon;
    if (d > 180.0) lon -= 360.0;
    if (d < -180.0) lon += 360.0;
    return lon;
}

vec2 invBilinearSafe(vec2 lonlat, vec2 refLonLat, in vec3 quad[4]) {

    lonlat.x = unwrapLonNear(lonlat.x, refLonLat.x);

    vec2 uv = invBilinear(lonlat, quad);
    if (uv.x >= 0.0 && uv.y >= 0.0) return uv;

    // 0~360, -180~180 혼용 대응
    vec2 lonlat2 = lonlat;
    lonlat2.x += 360.0;
    uv = invBilinear(lonlat2, quad);
    if (uv.x >= 0.0 && uv.y >= 0.0) return uv;

    lonlat2.x = lonlat.x - 360.0;
    uv = invBilinear(lonlat2, quad);
    if (uv.x >= 0.0 && uv.y >= 0.0) return uv;

    // 경도 체계 맞춘 뒤 다시
    vec2 lonlat3 = lonlat;
    if (boundsUse180(quad)) {
        // [-180,180]로 래핑
        lonlat3.x = mod(lonlat3.x + 180.0, 360.0);
        if (lonlat3.x < 0.0) lonlat3.x += 360.0;
        lonlat3.x -= 180.0;
    } else {
        // [0,360)로 래핑
        lonlat3.x = mod(lonlat3.x, 360.0);
        if (lonlat3.x < 0.0) lonlat3.x += 360.0;
    }
    uv = invBilinear(lonlat3, quad);
    if (uv.x >= 0.0 && uv.y >= 0.0) return uv;

    return clamp(vec2(uv.x, uv.y), vec2(0.001), vec2(0.999));
}

vec3 lonlataltToEcef(vec3 lonLatLev) {
    float a = 6378137.0;
    float e2 = 6.69437999014e-3;

    float lat = radians(lonLatLev.y);
    float lon = radians(lonLatLev.x);
    float alt = lonLatLev.z;

    float cosLat = cos(lat), sinLat = sin(lat);
    float cosLon = cos(lon), sinLon = sin(lon);

    float N = a / sqrt(1.0 - e2 * sinLat * sinLat);

    return vec3(
        (N + alt) * cosLat * cosLon,
        (N + alt) * cosLat * sinLon,
        ((1.0 - e2) * N + alt) * sinLat
    );
}

vec3 lonlatToUnit(vec2 lonlatDeg) {
    float lon = radians(lonlatDeg.x);
    float lat = radians(lonlatDeg.y);
    float clat = cos(lat);
    return normalize(vec3(clat * cos(lon), clat * sin(lon), sin(lat)));
}

vec2 unitToLonlat(vec3 u) {
    u = normalize(u);
    float lon = atan(u.y, u.x);
    float lat = asin(clamp(u.z, -1.0, 1.0));
    return vec2(degrees(lon), degrees(lat));
}

vec3 slerpUnit(vec3 a, vec3 b, float t) {
    float d = clamp(dot(a, b), -1.0, 1.0);
    float omega = acos(d);
    if (omega < 1e-6) return normalize(mix(a, b, t));
    float so = sin(omega);
    return normalize((sin((1.0 - t) * omega) / so) * a + (sin(t * omega) / so) * b);
}

void main() {
    textureCoordinate = st;

    vec2 A = clippingPoints[0].xy;
    vec2 B = clippingPoints[1].xy;

    float s = st.x;
    float t = st.y;

    vec3 ua = lonlatToUnit(A);
    vec3 ub = lonlatToUnit(B);
    vec3 u  = slerpUnit(ua, ub, s);
    vec2 lonlat = unitToLonlat(u);

    float alt = mix(altitudeBounds[0], altitudeBounds[1], t);
    float w = (abs(altitudeBounds[1] - altitudeBounds[0]) < 1e-6) ? 0.5 : (alt - altitudeBounds[0]) / (altitudeBounds[1] - altitudeBounds[0]);

    float dLon = lonlat.x - A.x;
    if (dLon > 180.0) lonlat.x -= 360.0;
    if (dLon < -180.0) lonlat.x += 360.0;

    lonlat.x = mod(lonlat.x, 360.0);
    if (lonlat.x < 0.0) lonlat.x += 360.0;

    vec2 uv = invBilinearSafe(lonlat, A, bounds);

    if (uv.x < 0.0 || uv.y < 0.0) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        npos = vec3(-1.0);
        return;
    }

    npos = vec3(uv, w);

    vec3 ecef = lonlataltToEcef(vec3(lonlat.x, lonlat.y, alt * verticalScale));
    gl_Position = czm_viewProjection * vec4(ecef, 1.0);
}