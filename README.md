# SortVision AI

This is an AI-powered trash sorting assistant built with Next.js and Teachable Machine.

## How to Deploy to Vercel

Deploying this application is straightforward using Vercel and GitHub.

### Step 1: Push Your Code to a GitHub Repository

1.  **Create a GitHub Account:** If you don't have one, sign up at [github.com](https://github.com).
2.  **Create a New Repository:** From the GitHub dashboard, create a new repository.
3.  **Upload Your Project:**
    *   Install Git on your computer if you haven't already.
    *   In your project folder, open a terminal and run the following commands to upload your code:

    ```bash
    # Initialize a new git repository
    git init -b main

    # Add all files to be tracked
    git add .

    # Create your first commit
    git commit -m "Initial commit"

    # Link it to your GitHub repository
    # Replace <YOUR_GITHUB_REPOSITORY_URL> with your actual repo URL
    git remote add origin <YOUR_GITHUB_REPOSITORY_URL>

    # Push the code to GitHub
    git push -u origin main
    ```

### Step 2: Deploy on Vercel

1.  **Sign Up for Vercel:** Go to [vercel.com](https://vercel.com) and sign up, preferably using your GitHub account for a seamless integration.

2.  **Import Your Project:**
    *   From your Vercel dashboard, click "**Add New...**" -> "**Project**".
    *   Find the GitHub repository you just created and click "**Import**".

3.  **Configure the Project:** Vercel will automatically detect that this is a **Next.js** project and configure the settings for you. Ensure the settings match the following:

    *   **Framework Preset:** `Next.js`
    *   **Root Directory:** `./`
    *   **Build and Output Settings:**
        *   **Build Command:** `npm run build`
        *   **Output Directory:** `.next`
        *   **Install Command:** `npm install`

4.  **Deploy:** Click the "**Deploy**" button.

Vercel will handle the rest! It will build your application and provide you with a live URL once it's done. Any future pushes to your `main` branch on GitHub will automatically trigger a new deployment.
