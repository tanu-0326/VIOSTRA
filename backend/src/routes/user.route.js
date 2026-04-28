import { Router } from "express";
import {  registerUser, loginUser, logoutUser, handleRefreshTokenAccess, changeCurrentPassword, getCurrentUser, updateAccountDetails, updateUserAvatar, updateUserCoverImage } from "../controllers/user.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.route("/register").post(
    upload.fields([
        {
            name : "avatar",
            maxCount : 1
        },
        {
            name : "coverImage",
            maxCount : 1
        }
    ]),
    registerUser
);

router.route("/login").post(loginUser);

//secured routes
router.route("").get(verifyJWT, getCurrentUser)
router.route("/logout").post(verifyJWT, logoutUser);
router.route("/refresh").post(handleRefreshTokenAccess);
router.route("/change-password").post(verifyJWT, changeCurrentPassword);
router.route("/update-user").post(verifyJWT, updateAccountDetails);
router.route("/update-avatar").post(
    verifyJWT,
    upload.single("avatar"),
    updateUserAvatar
);
router.route("/update-cover").post(
    verifyJWT,
    upload.single("coverImage"),
    updateUserCoverImage
);
export default router