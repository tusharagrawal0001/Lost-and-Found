package com.example.Lost_And_Found;

import com.example.Lost_And_Found.entity.ItemClass;
import com.example.Lost_And_Found.repository.ItemClassRepo;
import com.example.Lost_And_Found.service.DescriptionBasedMatchingService;
import com.example.Lost_And_Found.service.DescriptionBasedResultService;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class DescriptionBasedResultServiceTest {

    @Test
    void matchesReportsWithoutPreviouslyStoredEmbeddings() {
        ItemClass report = new ItemClass();
        report.setDescription("wallet with a logo");

        ItemClassRepo repository = mock(ItemClassRepo.class);
        when(repository.findAll()).thenReturn(List.of(report));

        DescriptionBasedMatchingService matchingService = new DescriptionBasedMatchingService();
        DescriptionBasedResultService resultService =
                new DescriptionBasedResultService(repository, matchingService);
        float[] queryEmbedding = matchingService.generateEmbedding(
                "blue wallet with a logo",
                List.of("blue wallet with a logo")
        );

        var matches = resultService.matchResult(queryEmbedding, 30.0);

        assertEquals(1, matches.size());
        assertEquals(89.44, matches.get(0).getPercentage(), 0.01);
    }
}
