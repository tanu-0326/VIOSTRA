import { asyncHandler } from "../utils/asyncHandler.js"
import ApiError from "../utils/ApiError.js"
import {User} from "../models/user.models.js"
import { uploadOnCloudinary } from "../utils/cloudinaryService.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import fs from 'fs'
import jwt from 'jsonwebtoken'
import bcrypt from "bcrypt"
import { isGeneratorFunction } from "util/types"

const generateAccessRefeshTokens = async (user) => {
    try {
        const accessToken = user.generateAccessToken(); 
        const refreshToken = user.generateRefreshToken(); 
        const encryptedRefreshToken  = await bcrypt.hash(refreshToken, 10);

        user.refreshToken = encryptedRefreshToken;
        await user.save({validateBeforeSave : false});

        return {accessToken, refreshToken};
        
    } catch (error) {
        throw new ApiError(500, "Unable to create access and refresh tokens")
    }
}

const registerUser = asyncHandler(async (req, res) => {

    //get user data
    const {username, fullName, email, password} = req.body;

    //because multer runs before so files needs to be deleted repeatedly
    const avatarLocalPath = req.files?.avatar?.[0]?.path;
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

const loginUser = asyncHandler(async (req, res) => {


    const {username, email, password} = req.body;

    //input valitation
    if(!(username || email)){
        throw new ApiError(400, "email or username required");
    }
    if(!password){
        throw new ApiError(400, "password is required")
    }

    const existingUser = await User.findOne({
        $or : [{username}, {email}]
    })

    if(!existingUser){
        throw new ApiError(400, "User Doesn't Exist");
    }

    const isPasswordValid = await existingUser.isPasswordCorrect(password);
    
    if(!isPasswordValid){
        throw new ApiError(401, "Invalid password");
    }

    const {accessToken, refreshToken} = await generateAccessRefeshTokens(existingUser);

    const loggedInUser = await User.findById(existingUser._id).select("-password -refreshToken");

    const options = {
        httpOnly : true,
        secure : false, //change in production
    }

    return res.status(200)
                .cookie("accessToken", accessToken, options)
                .cookie("refreshToken", refreshToken, options)
                .json(
                    new ApiResponse(
                        200,
                        {
                           user : loggedInUser,                            
                        },
                        "User LoggedIn Sucessfully"
                    )
                );

})

const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set : {
                refreshToken : undefined
            }
        },
        {
            new : true
        }
    );

    const options = {
        httpOnly : true,
        secure : false, //change in production
    }

    return res
            .status(200)
            .clearCookie("accessToken", options)
            .clearCookie("refreshToken", options)
            .json(new ApiResponse(200, {}, "User loggedOut successfully"))
})

const handleRefreshTokenAccess = asyncHandler(async (req, res) => {
    
    const existingToken = req.cookies?.refreshToken;


    if(!existingToken){
        throw new ApiError(401, "Unauthorized Request");
    };

    
        const decodedToken = jwt.verify(existingToken, process.env.REFRESH_TOKEN_SECRET);
    
        const existingUser = await User.findById(decodedToken?._id);
    
         if(!existingUser){
                throw new ApiError(401, "Invalid Refresh Token")
            }
    
        const checkToken = await bcrypt.compare(existingToken, existingUser?.refreshToken);
    
        if(!checkToken){
            throw new ApiError(401, "Unauthorized Refresh Token")
        }
    
        const {accessToken, refreshToken} = await generateAccessRefeshTokens(existingUser);
    
        const options = {
            httpOnly : true,
            secure : false, //change in production
        }
    
        return res.status(200)
                    .cookie("accessToken", accessToken, options)
                    .cookie("refreshToken", refreshToken, options)
                    .json(
                        new ApiResponse(
                            200,
                            {},
                            "Tokens generated Successfully"
                        )
                    );
})

const changeCurrentPassword = asyncHandler(async (req, res) => {

    const {oldPassword, newPassword} = req.body;

    if(!(oldPassword && newPassword)){
        throw new ApiError(400, "All fields are required")
    }

    if(oldPassword === newPassword){
        throw new ApiError(401, "Enter a new Password")
    };

    const user = await User.findById(req.user?._id);

    const checkPassword = await user.isPasswordCorrect(oldPassword);

    if(!checkPassword){
        throw new ApiError(400, "Incorrect Old Password");
    }

    user.password = newPassword;

    await user.save({validateBeforeSave : false});

    return res.status(200)
              .json(new ApiResponse(200, {}, "Password updated"));
})

const getCurrentUser = asyncHandler(async (req, res) => {

    return res.status(200)
              .json(new ApiResponse(200, req.user, "User Fetched"))

})

const updateAccountDetails = asyncHandler(async(req, res) => {

   

    const {fullName, email} = req.body

    if(!fullName || !email){
        throw new ApiError(400, "All feilds are required");
    };

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set :{
                fullName,
                email,
            }
        },
        {returnDocument : "after"}
    ).select("-password -refreshToken");

    if(!user){
        throw new ApiError(500, "Couldn't update user")
    }

    return res.status(200)
        .json(new ApiResponse(200, {user}, "Updated Successfully"));
})

const updateUserAvatar = asyncHandler(async (req, res) => {
    const avatarLocalPath = req.file?.path;
    const deleteTempFile = () => {
        try{
            fs.unlinkSync(avatarLocalPath);
        }catch(error){
            console.log("File Cleanup failed")
        }
    };

    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar file is required")
    };

    const avatar = await uploadOnCloudinary(avatarLocalPath);
     if(!avatar.url){
        deleteTempFile()
        throw new ApiError(500, "Server Error : Avatar not uploaded");
    };

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set : {
                avatar : avatar.url
            }
        },
        {returnDocument : "after"}

    ).select("-password -refreshToken");

    if(!user){
        throw new ApiError(500, "Couldn't update user")
    }

    return res.status(200)
        .json(new ApiResponse(200, user, "Updated Successfully"));

})

const updateUserCoverImage = asyncHandler(async (req, res) => {
    const coverImageLocalPath = req.file?.path;
    const deleteTempFile = () => {
        try{
            fs.unlinkSync(coverImageLocalPath);
        }catch(error){
            console.log("File Cleanup failed")
        }
    };

    if(!coverImageLocalPath){
        throw new ApiError(400, "Cover Image file is required")
    };

    const coverImage = await uploadOnCloudinary(coverImageLocalPath);
     if(!coverImage.url){
        deleteTempFile()
        throw new ApiError(500, "Server Error : Files not uploaded");
    };

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set : {
                coverImage : coverImage.url
            }
        },
        {returnDocument : "after"}

    ).select("-password -refreshToken");

    if(!user){
        throw new ApiError(500, "Couldn't update user")
    }

    return res.status(200)
        .json(new ApiResponse(200, user, "Updated Successfully"));

})

export {
    registerUser,
    loginUser,
    logoutUser,
    handleRefreshTokenAccess,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage
}