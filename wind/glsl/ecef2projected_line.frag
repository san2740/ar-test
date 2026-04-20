out vec4 fragColor_1;
uniform sampler2D windSpeedTextures;
uniform int colorMode;
uniform vec3 dimensions;
uniform float altitudes[33];
uniform vec3 minValues;
uniform vec3 maxValues;
uniform float altitudeBounds[2];
uniform bool highlights[33];
uniform sampler2D customColorTextures;
uniform int typhoonHighlightMode;
uniform float speedMin;
uniform float speedMax;


// uniform sampler2D color;
uniform float particleRate;

in vec2 textureCoordinate;
in float repositioned;
in vec3 positionWC;
in vec3 normalizedPosition;
in float trailFade;

in vec2 v_lonLat;
in float v_typhoonBoost;

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

        float boost = clamp(v_typhoonBoost, 0.0, 2.0);
        float localParticleRate;
        if (typhoonHighlightMode == 1) {
            // 중심부는 거의 꽉 차게, 바깥은 거의 사라지게
            float core = pow(clamp(boost / 2.0, 0.0, 1.0), 0.45);
            float highlightRate = mix(0.015, 1.0, core);
            localParticleRate = clamp(highlightRate * particleRate, 0.0, 1.0);
        } else {
            // 일반 모드
            localParticleRate = particleRate;
        }

        if(textureCoordinate.x > localParticleRate) {
            discard;
        }
        if(shouldHide(normalizedPosition)) {
            discard;
            return;
        }

        vec3 color;
        vec3 speed = getWindSpeedAt(normalizedPosition);
        float speedLength = length(speed);

        if (speedLength < speedMin || speedLength > speedMax) {
            discard;
        }

        if(colorMode == 0) {
        // 풍속

            if (speedLength >= 100.0) {
                color = vec3(1.000, 1.000, 1.000);        // 100  #ffffff
            } else if (speedLength >= 95.0) {
                color = vec3(0.992, 0.765, 0.949);        // 95   #fdc3f2
            } else if (speedLength >= 90.0) {
                color = vec3(1.000, 0.533, 0.867);        // 90   #ff88dd
            } else if (speedLength >= 85.0) {
                color = vec3(1.000, 0.400, 0.800);        // 85   #ff66cc
            } else if (speedLength >= 80.0) {
                color = vec3(1.000, 0.267, 0.733);        // 80   #ff44bb
            } else if (speedLength >= 75.0) {
                color = vec3(1.000, 0.133, 0.667);        // 75   #ff22aa
            } else if (speedLength >= 70.0) {
                color = vec3(1.000, 0.000, 0.600);        // 70   #ff0099
            } else if (speedLength >= 65.0) {
                color = vec3(1.000, 0.000, 0.400);        // 65   #ff0066
            } else if (speedLength >= 60.0) {
                color = vec3(1.000, 0.000, 0.200);        // 60   #ff0033
            } else if (speedLength >= 55.0) {
                color = vec3(1.000, 0.000, 0.000);        // 55   #ff0000
            } else if (speedLength >= 50.0) {
                color = vec3(1.000, 0.200, 0.000);        // 50   #ff3300
            } else if (speedLength >= 45.0) {
                color = vec3(1.000, 0.400, 0.000);        // 45   #ff6600
            } else if (speedLength >= 40.0) {
                color = vec3(1.000, 0.600, 0.000);        // 40   #ff9900
            } else if (speedLength >= 35.0) {
                color = vec3(1.000, 0.800, 0.000);        // 35   #ffcc00
            } else if (speedLength >= 30.0) {
                color = vec3(1.000, 1.000, 0.000);        // 30   #ffff00
            } else if (speedLength >= 25.0) {
                color = vec3(0.800, 1.000, 0.000);        // 25   #ccff00
            } else if (speedLength >= 20.0) {
                color = vec3(0.600, 1.000, 0.000);        // 20   #99ff00
            } else if (speedLength >= 15.0) {
                color = vec3(0.400, 1.000, 0.000);        // 15   #66ff00
            } else if (speedLength >= 10.0) {
                color = vec3(0.000, 1.000, 0.000);        // 10   #00ff00
            } else if (speedLength >= 8.0) {
                color = vec3(0.000, 1.000, 0.400);        // 8    #00ff66
            } else if (speedLength >= 6.0) {
                color = vec3(0.000, 1.000, 0.800);        // 6    #00ffcc
            } else if (speedLength >= 5.0) {
                color = vec3(0.000, 1.000, 1.000);        // 5    #00ffff
            } else if (speedLength >= 4.0) {
                color = vec3(0.000, 0.800, 1.000);        // 4    #00ccff
            } else if (speedLength >= 3.0) {
                color = vec3(0.000, 0.600, 1.000);        // 3    #0099ff
            } else if (speedLength >= 2.0) {
                color = vec3(0.000, 0.400, 1.000);        // 2    #0066ff
            } else if (speedLength >= 1.0) {
                color = vec3(0.000, 0.200, 1.000);        // 1    #0033ff
            } else {
                color = vec3(0.000, 0.000, 1.000);        // 0    #0000ff
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
            if (relativeHumidity >= 100.0) {
                color = vec3(0.000, 1.000, 1.000);        // 100 #00ffff
            } else if (relativeHumidity >= 95.0) {
                color = vec3(0.000, 0.800, 1.000);        // 95  #00ccff
            } else if (relativeHumidity >= 90.0) {
                color = vec3(0.000, 0.600, 1.000);        // 90  #0099ff
            } else if (relativeHumidity >= 85.0) {
                color = vec3(0.000, 0.400, 1.000);        // 85  #0066ff
            } else if (relativeHumidity >= 80.0) {
                color = vec3(0.000, 0.200, 0.800);        // 80  #0033cc
            } else if (relativeHumidity >= 75.0) {
                color = vec3(0.102, 0.102, 0.400);        // 75  #1a1a66
            } else if (relativeHumidity >= 70.0) {
                color = vec3(0.165, 0.165, 0.333);        // 70  #2a2a55
            } else if (relativeHumidity >= 65.0) {
                color = vec3(0.227, 0.227, 0.333);        // 65  #3a3a55
            } else if (relativeHumidity >= 60.0) {
                color = vec3(0.290, 0.290, 0.333);        // 60  #4a4a55
            } else if (relativeHumidity >= 55.0) {
                color = vec3(0.333, 0.333, 0.333);        // 55  #555555
            } else if (relativeHumidity >= 50.0) {
                color = vec3(0.353, 0.314, 0.314);        // 50  #5a5050
            } else if (relativeHumidity >= 45.0) {
                color = vec3(0.376, 0.271, 0.271);        // 45  #604545
            } else if (relativeHumidity >= 40.0) {
                color = vec3(0.416, 0.251, 0.251);        // 40  #6a4040
            } else if (relativeHumidity >= 35.0) {
                color = vec3(0.478, 0.271, 0.208);        // 35  #7a4535
            } else if (relativeHumidity >= 30.0) {
                color = vec3(0.541, 0.314, 0.188);        // 30  #8a5030
            } else if (relativeHumidity >= 25.0) {
                color = vec3(0.604, 0.353, 0.165);        // 25  #9a5a2a
            } else if (relativeHumidity >= 20.0) {
                color = vec3(0.667, 0.400, 0.145);        // 20  #aa6625
            } else if (relativeHumidity >= 15.0) {
                color = vec3(0.733, 0.467, 0.133);        // 15  #bb7722
            } else if (relativeHumidity >= 10.0) {
                color = vec3(0.800, 0.533, 0.125);        // 10  #cc8820
            } else if (relativeHumidity >= 5.0) {
                color = vec3(0.867, 0.600, 0.094);        // 5   #dd9918
            } else {
                color = vec3(0.933, 0.667, 0.063);        // 0   #eeaa10
            }
        } else if(colorMode == 3) {
            vec3 customValue = getCustomColorAt(normalizedPosition);
            float temperature = customValue.r - 273.15;  // K → C

            if (temperature >= 55.0) {
                color = vec3(0.102, 0.102, 0.102);        // 55  #1a1a1a
            } else if (temperature >= 50.0) {
                color = vec3(0.200, 0.000, 0.000);        // 50  #330000
            } else if (temperature >= 45.0) {
                color = vec3(0.302, 0.000, 0.000);        // 45  #4d0000
            } else if (temperature >= 40.0) {
                color = vec3(0.502, 0.000, 0.000);        // 40  #800000
            } else if (temperature >= 35.0) {
                color = vec3(0.702, 0.000, 0.000);        // 35  #b30000
            } else if (temperature >= 30.0) {
                color = vec3(0.902, 0.000, 0.000);        // 30  #e60000
            } else if (temperature >= 25.0) {
                color = vec3(1.000, 0.200, 0.000);        // 25  #ff3300
            } else if (temperature >= 20.0) {
                color = vec3(1.000, 0.400, 0.000);        // 20  #ff6600
            } else if (temperature >= 15.0) {
                color = vec3(1.000, 0.600, 0.000);        // 15  #ff9900
            } else if (temperature >= 10.0) {
                color = vec3(1.000, 0.800, 0.000);        // 10  #ffcc00
            } else if (temperature >= 5.0) {
                color = vec3(1.000, 0.933, 0.000);        // 5   #ffee00
            } else if (temperature >= 0.0) {
                color = vec3(1.000, 1.000, 0.000);        // 0   #ffff00
            } else if (temperature >= -5.0) {
                color = vec3(0.800, 1.000, 0.000);        // -5  #ccff00
            } else if (temperature >= -10.0) {
                color = vec3(0.600, 1.000, 0.000);        // -10 #99ff00
            } else if (temperature >= -15.0) {
                color = vec3(0.400, 1.000, 0.200);        // -15 #66ff33
            } else if (temperature >= -20.0) {
                color = vec3(0.200, 1.000, 0.400);        // -20 #33ff66
            } else if (temperature >= -25.0) {
                color = vec3(0.000, 1.000, 0.600);        // -25 #00ff99
            } else if (temperature >= -30.0) {
                color = vec3(0.000, 1.000, 0.800);        // -30 #00ffcc
            } else if (temperature >= -35.0) {
                color = vec3(0.000, 1.000, 1.000);        // -35 #00ffff
            } else if (temperature >= -40.0) {
                color = vec3(0.000, 0.800, 1.000);        // -40 #00ccff
            } else if (temperature >= -45.0) {
                color = vec3(0.000, 0.600, 1.000);        // -45 #0099ff
            } else if (temperature >= -50.0) {
                color = vec3(0.000, 0.400, 1.000);        // -50 #0066ff
            } else if (temperature >= -55.0) {
                color = vec3(0.000, 0.200, 1.000);        // -55 #0033ff
            } else if (temperature >= -60.0) {
                color = vec3(0.000, 0.000, 1.000);        // -60 #0000ff
            } else if (temperature >= -65.0) {
                color = vec3(0.200, 0.000, 1.000);        // -65 #3300ff
            } else if (temperature >= -70.0) {
                color = vec3(0.400, 0.000, 1.000);        // -70 #6600ff
            } else if (temperature >= -75.0) {
                color = vec3(0.600, 0.000, 1.000);        // -75 #9900ff
            } else {
                color = vec3(0.800, 0.000, 1.000);        // -80 #cc00ff
            }

        } else {
        // 
            color = vec3(0.0, 0.0, 0.0);
        }

        float alpha = trailFade;
        alpha = pow(alpha, 0.8);

        if (typhoonHighlightMode == 1) {
            float core = pow(clamp(boost / 2.0, 0.0, 1.0), 0.55);

            // 바깥은 거의 투명
            alpha *= mix(0.03, 1.85, core);

            // 중심은 훨씬 밝게
            color *= mix(0.18, 2.2, core);
        }

         // 과포화 방지
        color = clamp(color, 0.0, 1.0);
        alpha = clamp(alpha, 0.0, 1.0);

        fragColor_1 = vec4(color, alpha);

    } else {
        discard;
    }
}
