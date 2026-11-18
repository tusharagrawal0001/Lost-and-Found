package com.example.Lost_And_Found.service;

import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;

import com.example.Lost_And_Found.entity.ItemClass_User;
import com.example.Lost_And_Found.repository.ItemClass_UserRepo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class ItemClass_UserService {

    private final ItemClass_UserRepo itemClassUserRepo;
    private final DescriptionBasedMatchingService descriptionBasedMatchingService;

    public ItemClass_UserService(ItemClass_UserRepo itemClassUserRepo, DescriptionBasedMatchingService descriptionBasedMatchingService) {
        this.itemClassUserRepo = itemClassUserRepo;
        this.descriptionBasedMatchingService = descriptionBasedMatchingService;
    }

    private static final Logger log =
            LoggerFactory.getLogger(ItemClass_UserService.class);

    public void user_ItemDetail
            (ItemClass_User itemClassUser, MultipartFile[] imageData) throws IOException {
        if (itemClassUser == null ||
                itemClassUser.getUser_name() == null ||
                itemClassUser.getUser_name().isBlank() ||
                itemClassUser.getUser_description() == null ||
                itemClassUser.getUser_description().isBlank()) {
            throw new IllegalArgumentException("Name and description are required");
        }
        if (imageData == null || imageData.length == 0) {
            throw new IllegalArgumentException("At least one image is required");
        }
        if (imageData.length > 6) {
            throw new IllegalArgumentException("A maximum of 6 images is allowed");
        }

        if(imageData!=null && imageData.length>0){
            List<byte[]> imageListData = new ArrayList<>();
            for(MultipartFile data:imageData){
                validateImage(data);
                imageListData.add(data.getBytes());
            }
            itemClassUser.setUserImageList(imageListData);
            List<ItemClass_User> user_description = itemClassUserRepo.findAll();
            List<String> user_descriptionEmbedding = new ArrayList<>(
                    user_description
                            .stream()
                            .map(ItemClass_User::getUser_description)
                            .filter(Objects::nonNull)
                            .toList()
            );
            float[] user_embeddings = descriptionBasedMatchingService
                    .generateEmbedding(itemClassUser.getUser_description(), user_descriptionEmbedding);
            itemClassUser.setUser_descriptionEmbeddings(user_embeddings);
            itemClassUser.setUser_report_createdTime(Instant.now());
            log.info("User_Embedding details saved:"+Arrays.toString(user_embeddings));
        }
        itemClassUserRepo.save(itemClassUser);
    }

    public void user_UpdateImage(MultipartFile[] newImageData,String Id) throws IOException {
        ItemClass_User itemClassUser = itemClassUserRepo.findById(Id).orElse(null);
        if(itemClassUser!=null){
            if (newImageData == null || newImageData.length == 0 || newImageData.length > 6) {
                throw new IllegalArgumentException("Provide between 1 and 6 images");
            }
            List<byte[]> user_ImageDataList = itemClassUser.getUserImageList();
            if (user_ImageDataList == null) {
                user_ImageDataList = new ArrayList<>();
            } else {
                user_ImageDataList.clear();
            }
            for(MultipartFile user_imageData:newImageData){
                validateImage(user_imageData);
                user_ImageDataList.add(user_imageData.getBytes());
            }
            itemClassUser.setUserImageList(user_ImageDataList);
            itemClassUserRepo.save(itemClassUser);
        }
    }

    private void validateImage(MultipartFile image) {
        if (image.isEmpty()) {
            throw new IllegalArgumentException("Empty image files are not allowed");
        }
        if (image.getSize() > 10 * 1024 * 1024) {
            throw new IllegalArgumentException("Each image must be smaller than 10 MB");
        }
        String type = image.getContentType();
        if (!List.of("image/jpeg", "image/png", "image/webp").contains(type)) {
            throw new IllegalArgumentException("Only JPEG, PNG, and WebP images are allowed");
        }
    }
}
