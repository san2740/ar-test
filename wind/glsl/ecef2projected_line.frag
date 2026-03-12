out vec4 fragColor_1;
uniform sampler2D windSpeedTextures;
uniform int colorMode;
uniform vec3 dimensions;
uniform float altitudes[30];
uniform vec3 minValues;
uniform vec3 maxValues;
uniform float altitudeBounds[2];
uniform bool highlights[30];
uniform sampler2D customColorTextures;

// uniform sampler2D color;
uniform float particleRate;

in vec2 textureCoordinate;
in float repositioned;
in vec3 positionWC;
in vec3 normalizedPosition;

vec3 sampleMultilevelTexture(sampler2D multilevelTexture, int levelIndex, vec2 normalizedPosition) {
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

    vec3 lb = texture(multilevelTexture, vec2(globalStart.x, globalStart.y)).xyz;
    vec3 rb = texture(multilevelTexture, vec2(globalEnd.x, globalStart.y)).xyz;
    vec3 lt = texture(multilevelTexture, vec2(globalStart.x, globalEnd.y)).xyz;
    vec3 rt = texture(multilevelTexture, vec2(globalEnd.x, globalEnd.y)).xyz;

    vec3 b = mix(lb, rb, frag.x);
    vec3 t = mix(lt, rt, frag.x);
    vec3 r = mix(b, t, frag.y);

    return r;
}

bool shouldHide(vec3 normalizedPosition) {
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
        return false;

    return !highlights[highLevelIndex];

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
        normalizedWindSpeed = sampleMultilevelTexture(windSpeedTextures, lowLevelIndex, normalizedPosition.xy);
    } else {
        vec3 low = sampleMultilevelTexture(windSpeedTextures, lowLevelIndex, normalizedPosition.xy);
        vec3 high = sampleMultilevelTexture(windSpeedTextures, highLevelIndex, normalizedPosition.xy);

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

vec3 getCustomColorAt(vec3 normalizedPosition) {
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

    vec3 value = vec3(0.0);
    if(lowLevelIndex == highLevelIndex) {
        value = sampleMultilevelTexture(customColorTextures, lowLevelIndex, normalizedPosition.xy);
    } else {
        vec3 low = sampleMultilevelTexture(customColorTextures, lowLevelIndex, normalizedPosition.xy);
        vec3 high = sampleMultilevelTexture(customColorTextures, highLevelIndex, normalizedPosition.xy);

        float ratio = (altitude - altitudes[lowLevelIndex]) / (altitudes[highLevelIndex] - altitudes[lowLevelIndex]);
        value = low + (high - low) * ratio;
    }
    return value;
}

void main() {
    if(repositioned == 0.0) {
        if(textureCoordinate.x > particleRate) {
            discard;
        }
        if(shouldHide(normalizedPosition)) {
            discard;
            return;
        }

        vec3 color;
        if(colorMode == 0) {
        // 풍속
            vec3 speed = getWindSpeedAt(normalizedPosition);
            float speedLength = length(speed);

            if(speedLength >= 52.5) {
                color = vec3(0.2, 0.2, 0.2);
            } else if(speedLength >= 50.0) {
                color = vec3(0.706, 0., 0.);
            } else if(speedLength >= 47.5) {
                color = vec3(0.824, 0., 0.);
            } else if(speedLength >= 45.0) {
                color = vec3(1., 0.196, 0.);
            } else if(speedLength >= 42.5) {
                color = vec3(1., 0.4, 0.);
            } else if(speedLength >= 40.0) {
                color = vec3(0.8, 0.667, 0.);
            } else if(speedLength >= 37.5) {
                color = vec3(0.878, 0.725, 0.);
            } else if(speedLength >= 35.0) {
                color = vec3(0.976, 0.804, 0.);
            } else if(speedLength >= 32.5) {
                color = vec3(1., 0.863, 0.122);
            } else if(speedLength >= 30.0) {
                color = vec3(1., 0.882, 0.);
            } else if(speedLength >= 27.5) {
                color = vec3(0., 0.353, 0.);
            } else if(speedLength >= 25.0) {
                color = vec3(0., 0.549, 0.);
            } else if(speedLength >= 22.5) {
                color = vec3(0., 0.745, 0.);
            } else if(speedLength >= 20.0) {
                color = vec3(0., 1., 0.);
            } else if(speedLength >= 17.5) {
                color = vec3(0., 0.2, 0.961);
            } else if(speedLength >= 15.0) {
                color = vec3(0., 0.608, 0.961);
            } else if(speedLength >= 12.5) {
                color = vec3(0., 0.784, 1.);
            } else if(speedLength >= 10.0) {
                color = vec3(0.2, 0.827, 1.);
            } else if(speedLength >= 7.5) {
                color = vec3(0.4, 0.871, 1.);
            } else if(speedLength >= 5.0) {
                color = vec3(0.6, 0.914, 1.);
            } else if(speedLength >= 2.5) {
                color = vec3(0.8, 0.957, 1.);
            } else if(speedLength >= 0.0) {
                color = vec3(1., 1., 1.);
            } else {
                color = vec3(1., 1., 1.);
            }

        } else if(colorMode == 1) {
        // 고도
            float boundaryAltitudeSize = (altitudeBounds[1] - altitudeBounds[0]);
            float altitude = (boundaryAltitudeSize == 0.0) ? altitudeBounds[1] : (normalizedPosition.z * (altitudeBounds[1] - altitudeBounds[0]) + altitudeBounds[0]);

        // float altInData = altitude / verticalScale;
            if(altitude >= 9874.0) {
            // 100 hpa 
                color = vec3(0.694, 0.408, 0.722);
            } else if(altitude >= 8748.0) {
            // 200 hpa
                color = mix(vec3(0.145, 0.173, 0.639), vec3(0.694, 0.408, 0.722), (altitude - 8748.0) / (9874.0 - 8748.0));
            } else if(altitude >= 7622.0) {
            // 300 hpa
                color = mix(vec3(0., 0.51, 0.992), vec3(0.145, 0.173, 0.639), (altitude - 7622.0) / (8748.0 - 7622.0));
            } else if(altitude >= 6496.0) {
            // 400 hpa
                color = mix(vec3(0., 0.988, 0.741), vec3(0., 0.51, 0.992), (altitude - 6496.0) / (7622.0 - 6496.0));
            } else if(altitude >= 5370.0) {
            // 500 hpa
                color = mix(vec3(0.173, 0.996, 0.), vec3(0., 0.988, 0.741), (altitude - 5370.0) / (6496.0 - 5370.0));
            } else if(altitude >= 4244.0) {
            // 600 hpa
                color = mix(vec3(0.655, 0.98, 0.), vec3(0.173, 0.996, 0.), (altitude - 4244.0) / (5370.0 - 4244.0));
            } else if(altitude >= 3118.0) {
            // 700 hpa
                color = mix(vec3(1., 0.843, 0.), vec3(0.655, 0.98, 0.), (altitude - 3118.0) / (4244.0 - 3118.0));
            } else if(altitude >= 1992.0) {
            // 800 hpa
                color = mix(vec3(1., 0.502, 0.137), vec3(1., 0.843, 0.), (altitude - 1992.0) / (3118.0 - 1992.0));
            } else if(altitude >= 979.0) {
            // 900 hpa
                color = mix(vec3(1., 0.271, 0.271), vec3(1., 0.502, 0.137), (altitude - 979.0) / (1992.0 - 979.0));
            }
        // else if(altInData >= 508.0) {
        //     // 950 hpa
        //     color = mix(vec3(1.,1.,1.), vec3(1.,0.271,0.271), (altInData - 508.0) / (979.0 - 508.0));
        // }
            else if(altitude >= 60.0) {
            // 1000 hpa
                color = mix(vec3(1., 1., 1.), vec3(1., 0.271, 0.271), (altitude - 60.0) / (979.0 - 60.0));
            } else {
            // ~1000 hpa
                color = vec3(1., 1., 1.);
            }
        } else if(colorMode == 2) {
            // 습도
            vec3 customValue = getCustomColorAt(normalizedPosition);
            float relativeHumidity = customValue.r;
            if(relativeHumidity >= 100.0) {
                color = vec3(0.2, 0.2, 0.2);
            } else if(relativeHumidity >= 95.0) {
            // 100 ~ 90
                color = mix(vec3(0., 0.012, 0.565), vec3(0.2, 0.2, 0.2), (relativeHumidity - 95.0) / 5.0);
            } else if(relativeHumidity >= 90.0) {
            // 100 ~ 90
                color = mix(vec3(0., 0.765, 0.871), vec3(0., 0.012, 0.565), (relativeHumidity - 90.0) / 5.0);
            } else if(relativeHumidity >= 85.0) {
            // 90 ~ 80
                color = mix(vec3(0.267, 1., 0.227), vec3(0., 0.765, 0.871), (relativeHumidity - 85.0) / 5.0);
            } else if(relativeHumidity >= 80.0) {
            // 90 ~ 80
                color = mix(vec3(0.639, 0.918, 0.), vec3(0.267, 1., 0.227), (relativeHumidity - 80.0) / 5.0);
            } else if(relativeHumidity >= 75.0) {
            // 80 ~ 70
                color = mix(vec3(0.996, 0.816, 0.), vec3(0.639, 0.918, 0.), (relativeHumidity - 75.0) / 5.0);
            } else if(relativeHumidity >= 70.0) {
            // 80 ~ 70
                color = mix(vec3(1., 0.286, 0.231), vec3(0.996, 0.816, 0.), (relativeHumidity - 70.0) / 5.0);
            } else if(relativeHumidity >= 65.0) {
            // 70 ~ 60
                color = mix(vec3(1., 0.706, 0.706), vec3(1., 0.286, 0.231), (relativeHumidity - 65.0) / 5.0);
            } else if(relativeHumidity >= 60.0) {
            // 70 ~ 60
                color = mix(vec3(1., 1., 1.), vec3(1., 0.706, 0.706), (relativeHumidity - 60.0) / 5.0);
            } else {
                color = vec3(1., 1., 1.);
            }
        } else {
        // 
            color = vec3(0.0, 0.0, 0.0);
        }

        fragColor_1 = vec4(color, 1.0);
    } else {
        discard;
    }
}
