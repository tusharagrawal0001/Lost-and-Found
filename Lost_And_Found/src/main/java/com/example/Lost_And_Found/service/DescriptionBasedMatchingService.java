package com.example.Lost_And_Found.service;

import java.util.Arrays;
import java.util.List;

import org.springframework.stereotype.Service;

@Service
public class DescriptionBasedMatchingService {
    private static final int VECTOR_SIZE = 256;

    public float[] generateEmbedding(
            String description,
            List<String> allDescriptions) {

        if (description == null || description.isBlank()) {
            throw new IllegalArgumentException(
                    "Description can't be empty"
            );
        }

        float[] vector =
                new float[VECTOR_SIZE];

        List<String> words =
                tokenize(description);

        for (String word : words) {
            int hash = Math.abs(word.hashCode());
            int index = hash % VECTOR_SIZE;
            vector[index] += 1.0f;
        }

        // Normalize vector
        normalize(vector);

        return vector;
    }

    private List<String> tokenize(String text) {

        return Arrays.stream(
                             text.toLowerCase()
                                 .replaceAll(
                                         "[^a-zA-Z0-9 ]",
                                         " "
                                 )
                                 .split("\\s+")
                     )
                     .filter(word -> !word.isBlank())
                     .toList();
    }

    private void normalize(float[] vector) {

        double magnitude = 0.0;

        for (float value : vector) {
            magnitude += value * value;
        }

        magnitude = Math.sqrt(magnitude);

        if (magnitude == 0) {
            return;
        }

        for (int i = 0; i < vector.length; i++) {
            vector[i] =
                    (float) (vector[i] / magnitude);
        }
    }

    public double cosineSimilarity(
            float[] vector1,
            float[] vector2) {

        if (vector1 == null ||
                vector2 == null) {
            return 0.0;
        }

        if (vector1.length != vector2.length) {
            return 0.0;
        }

        double dotProduct = 0.0;
        double magnitude1 = 0.0;
        double magnitude2 = 0.0;

        for (int i = 0; i < vector1.length; i++) {

            dotProduct +=
                    vector1[i] * vector2[i];

            magnitude1 +=
                    vector1[i] * vector1[i];

            magnitude2 +=
                    vector2[i] * vector2[i];
        }

        if (magnitude1 == 0 ||
                magnitude2 == 0) {
            return 0.0;
        }

        return dotProduct /
                (Math.sqrt(magnitude1) *
                        Math.sqrt(magnitude2));
    }
    public double getMatchPercentage(
            float[] vector1,
            float[] vector2) {

        return cosineSimilarity(
                vector1,
                vector2
        ) * 100;
    }
}
