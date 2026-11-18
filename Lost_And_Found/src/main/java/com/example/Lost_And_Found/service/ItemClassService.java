package com.example.Lost_And_Found.service;

import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;

import com.example.Lost_And_Found.entity.ItemClass;
import com.example.Lost_And_Found.repository.ItemClassRepo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class ItemClassService {

    private final ItemClassRepo itemClassRepo;
    private final DescriptionBasedMatchingService descriptionBasedMatchingService;

    public ItemClassService(ItemClassRepo itemClassRepo, DescriptionBasedMatchingService descriptionBasedMatchingService) {
        this.itemClassRepo = itemClassRepo;
        this.descriptionBasedMatchingService = descriptionBasedMatchingService;
    }

    private static final Logger log =
            LoggerFactory.getLogger(ItemClass.class);

    public void addItem(ItemClass itemData,MultipartFile[] imageData) throws IOException {
        validateItem(itemData);
        if (imageData == null || imageData.length == 0) {
            throw new IllegalArgumentException("At least one image is required");
        }
        if (imageData.length > 6) {
            throw new IllegalArgumentException("A maximum of 6 images is allowed");
        }
        if(imageData!=null&& imageData.length>0){
            List<byte[]> listImages = new ArrayList<>();
            for(MultipartFile data:imageData){
                if(!data.isEmpty()){
                    validateImage(data);
                    listImages.add(data.getBytes());
                }
            }
            itemData.setImage(listImages);
            List<ItemClass> existingItem = itemClassRepo.findAll();
            List<String> descriptionBased = new ArrayList<>(existingItem
                    .stream()
                    .map(ItemClass::getDescription)
                    .filter(Objects::nonNull)
                    .toList());

            if (itemData.getDescription() != null && !itemData.getDescription().isBlank()) {
                descriptionBased.add(itemData.getDescription());
            }
            float[] embeddings = descriptionBasedMatchingService
                    .generateEmbedding(itemData.getDescription(),descriptionBased);

            log.info("Embedding saved successfully:"+ Arrays.toString(embeddings));
            itemData.setDescriptionEmbedding(embeddings);
            itemData.setCreatedAt(Instant.now());
        }
        itemClassRepo.save(itemData);
    }

    public void updateImage(MultipartFile[] imageData,String id) throws IOException {
        ItemClass itemClass = itemClassRepo.findById(id).orElseThrow(() ->
                new IllegalArgumentException("Item not found: " + id));
        if(itemClass!=null) {
            if (imageData == null || imageData.length == 0 || imageData.length > 6) {
                throw new IllegalArgumentException("Provide between 1 and 6 images");
            }
            List<byte[]> imageList = itemClass.getImage();
            if (imageList == null) {
                imageList = new ArrayList<>();
            } else {
                imageList.clear();
            }
            for (MultipartFile newImageData : imageData) {
                if (newImageData != null&&!newImageData.isEmpty()) {
                    validateImage(newImageData);
                    imageList.add(newImageData.getBytes());
                }
            }
            itemClass.setImage(imageList);
            itemClassRepo.save(itemClass);
        }
    }

    public ItemClass displayTheReport(String id){
        ItemClass itemClass = itemClassRepo.findById(id).orElseThrow(() ->
                new IllegalArgumentException("Item not found: " + id));
        return itemClass;
    }

    public Page<ItemClass> displayAllTheData(int page, int size) throws Exception {
        if (page < 0 || size < 1 || size > 100) {
            throw new IllegalArgumentException("Page and size must be valid (size 1-100)");
        }
        Pageable pageable = PageRequest.of(page,size);
        return itemClassRepo.findAll(pageable);
    }

    private void validateItem(ItemClass item) {
        if (item == null) {
            throw new IllegalArgumentException("Item data is required");
        }
        if (item.getName() == null || item.getName().isBlank()) {
            throw new IllegalArgumentException("Item name is required");
        }
        if (item.getDescription() == null || item.getDescription().isBlank()) {
            throw new IllegalArgumentException("Item description is required");
        }
        if (item.getName().length() > 80 || item.getDescription().length() > 1000) {
            throw new IllegalArgumentException("Name or description exceeds the allowed length");
        }
    }

    private void validateImage(MultipartFile image) {
        if (image.getSize() > 10 * 1024 * 1024) {
            throw new IllegalArgumentException("Each image must be smaller than 10 MB");
        }
        String type = image.getContentType();
        if (!List.of("image/jpeg", "image/png", "image/webp").contains(type)) {
            throw new IllegalArgumentException("Only JPEG, PNG, and WebP images are allowed");
        }
    }

}
