@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ============================================
echo    GITHUB SETUP - Đẩy code lên GitHub
echo ============================================
echo.

:: Kiểm tra Git đã cài đặt chưa
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [LỖI] Git chưa được cài đặt!
    echo Vui lòng tải và cài đặt Git từ: https://git-scm.com/download/win
    pause
    exit /b 1
)

echo Git đã được cài đặt: 
git --version
echo.

:: Nhập thông tin
set /p GITHUB_USERNAME="Nhập GitHub Username: "
set /p GITHUB_EMAIL="Nhập Email GitHub: "
set /p REPO_NAME="Nhập tên Repository (VD: my-scripts): "

echo.
echo Chọn phương thức xác thực:
echo [1] HTTPS (cần Personal Access Token)
echo [2] SSH (cần SSH Key)
set /p AUTH_METHOD="Chọn (1 hoặc 2): "

if "%AUTH_METHOD%"=="1" (
    echo.
    echo === Sử dụng HTTPS ===
    echo Bạn cần tạo Personal Access Token tại:
    echo https://github.com/settings/tokens
    echo Chọn "Generate new token (classic)" và tick quyền "repo"
    echo.
    set /p GITHUB_TOKEN="Nhập Personal Access Token: "
    set REMOTE_URL=https://!GITHUB_USERNAME!:!GITHUB_TOKEN!@github.com/!GITHUB_USERNAME!/!REPO_NAME!.git
) else (
    echo.
    echo === Sử dụng SSH ===
    set REMOTE_URL=git@github.com:!GITHUB_USERNAME!/!REPO_NAME!.git
)

echo.
echo ============================================
echo    Cấu hình Git...
echo ============================================

:: Cấu hình Git global
git config --global user.name "%GITHUB_USERNAME%"
git config --global user.email "%GITHUB_EMAIL%"

echo Đã cấu hình:
echo   - Username: %GITHUB_USERNAME%
echo   - Email: %GITHUB_EMAIL%
echo.

:: Kiểm tra đã có repo chưa
if exist ".git" (
    echo [INFO] Thư mục này đã là Git repository
) else (
    echo Khởi tạo Git repository...
    git init
)

echo.
echo ============================================
echo    Thêm Remote và Push...
echo ============================================

:: Xóa remote cũ nếu có
git remote remove origin 2>nul

:: Thêm remote mới
echo Thêm remote origin...
git remote add origin !REMOTE_URL!

:: Thêm tất cả file
echo Thêm các file...
git add .

:: Commit
set /p COMMIT_MSG="Nhập commit message (VD: Initial commit): "
git commit -m "%COMMIT_MSG%"

:: Đổi tên branch thành main
git branch -M main

:: Push
echo.
echo Đang push lên GitHub...
git push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo ============================================
    echo    THÀNH CÔNG!
    echo ============================================
    echo Repository của bạn: https://github.com/%GITHUB_USERNAME%/%REPO_NAME%
) else (
    echo.
    echo [LỖI] Push thất bại!
    echo.
    echo Kiểm tra:
    echo 1. Repository "%REPO_NAME%" đã được tạo trên GitHub chưa?
    echo    Tạo tại: https://github.com/new
    echo 2. Personal Access Token có đúng không?
    echo 3. Bạn có quyền push vào repo này không?
)

echo.
pause
