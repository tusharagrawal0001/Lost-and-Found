package com.example.Lost_And_Found.service;

import com.example.Lost_And_Found.dto.ImageMatchResult;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Base64;

@Service
public class ImageMatchingService {

    static final double MATCH_THRESHOLD = 0.55;

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final String imageServiceUrl;

    public ImageMatchingService(
            ObjectMapper objectMapper,
            @Value("${image.search.url:http://127.0.0.1:8000}") String imageServiceUrl) {
        this.objectMapper = objectMapper;
        this.imageServiceUrl = imageServiceUrl.replaceAll("/$", "");
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();
    }

    public ImageMatchResult compareImages(byte[] userImage, byte[] reportedImage) {
        try {
            String payload = objectMapper.writeValueAsString(new ComparePayload(
                    Base64.getEncoder().encodeToString(userImage),
                    Base64.getEncoder().encodeToString(reportedImage)
            ));

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(imageServiceUrl + "/compare"))
                    .timeout(Duration.ofSeconds(30))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(payload))
                    .build();

            HttpResponse<String> response = httpClient.send(
                    request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                return new ImageMatchResult(false, 0.0, "Image service returned an error");
            }

            JsonNode result = objectMapper.readTree(response.body());
            double confidence = Math.max(0.0, Math.min(1.0, result.path("confidence").asDouble(0.0)));
            boolean match = result.path("match").asBoolean(false);
            String reason = result.path("reason").asText("Cosine image similarity");
            return new ImageMatchResult(match && confidence >= MATCH_THRESHOLD, confidence, reason);
        } catch (Exception exception) {
            return new ImageMatchResult(false, 0.0, "Unable to compare images");
        }
    }

    private record ComparePayload(String first_image_base64, String second_image_base64) {}
}