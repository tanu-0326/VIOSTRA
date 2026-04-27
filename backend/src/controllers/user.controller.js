import { asyncHandler } from "../utils/asyncHandler.js"
import ApiError from "../utils/ApiError.js"
import {User} from "../models/user.models.js"
import { uploadOnCloudinary } from "../utils/cloudinaryService.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import fs from 'fs'

const registerUser = asyncHandler(async (req, res) => {

    //get user data
    const {username, fullName, email, password} = req.body;

    const avatarLocalPath = req.files?.avatar[0]?.path;
    const coverImageLocalPath = req.files?.coverImage?.[0]?.path || "";

    const deleteTempFile = () => {
        try{
            fs.unlinkSync(avatarLocalPath);
            fs.unlinkSync(coverImageLocalPath);
        }catch(error){
            console.log("File Cleanup failed")
        }
    };

    //for empty feild
    if(
        [fullName, email, username, password].some((feild) => 
        feild?.trim() === "")
    ){  
        deleteTempFile();
        throw new ApiError(400, "All feilds are required")
    };

    //email password pattern validation
    if(email){
        const regex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/
        if(!regex.test(email.toLowerCase())) {
            deleteTempFile();
            throw new ApiError(400, "Invalid email pattern")
        }
    };
    if(password){
        const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@%#$!*&?])[A-Za-z\d@%#$!*&?]{8,12}$/
        if(!regex.test(password)){
            deleteTempFile();
            throw new ApiError(400, "Invalid password pattern")
        }
    };

    //existing user check
    const existingUser = await User.findOne({
        $or : [{username}, {email}]
    });

    if(existingUser){
        deleteTempFile();
        throw new ApiError(409, "User already exists")
    };

    //avatar and coverImage validation and handling
    
    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar file is required")
    };

    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = coverImageLocalPath ?   await uploadOnCloudinary(coverImageLocalPath) : "";

    if(!avatar){
        deleteTempFile()
        throw new ApiError(500, "Server Error : Files not uploaded");
    };

    if(coverImageLocalPath && !coverImage){
        deleteTempFile()
        throw new ApiError(500, "Server Error : Files not uploaded");
    }

    //database entry

    const user = await User.create({
        username : username.toLowerCase(),
        email : email.toLowerCase(),
        fullName,
        password,
        avatar : avatar.url,
        coverImage : coverImage?.url || ""

    });

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    );

    if(!createdUser){
        throw new ApiError(500, "Server error : Unable to create Profile")
    };

    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered Succesfully")
    );


})

export {registerUser}