# SortVision AI

## Formal Project Description for Defense

### **Project Title: SortVision AI: An Autonomous, Edge-Powered Waste Classification and Sorting Platform**

#### **Abstract**

SortVision AI is an integrated hardware and software platform designed to address critical challenges in waste management through intelligent automation. The system leverages on-device machine learning to perform real-time classification of waste materials via a standard smartphone camera. It subsequently interfaces with an external electromechanical sorting apparatus via Web Bluetooth to automate the physical sorting process. The platform is architected as an offline-first Progressive Web App (PWA), ensuring robust, high-availability operation in environments with limited or no internet connectivity. This project demonstrates a cost-effective, scalable, and secure solution for automated waste stream management.

---

### **Core Features and Technical Merits**

#### **1. On-Device AI Processing Core: High-Performance, Secure, and Autonomous**

The cornerstone of the SortVision platform is its edge-based processing architecture, which provides significant operational advantages:
*   **Real-Time, Low-Latency Classification:** By executing a custom-trained TensorFlow.js model directly on the client device, the system achieves immediate object classification without the network latency associated with cloud-based AI services.
*   **Data Privacy and Security by Design:** All image processing occurs locally. No sensitive visual data is transmitted externally, ensuring compliance with privacy requirements and reducing data security risks.
*   **Full Offline Functionality:** The system is architected for complete operational independence. After initial setup, all core functionalities—including AI inference and hardware control—operate without requiring an active internet connection, ensuring high reliability in diverse field conditions.

#### **2. Advanced System Integration and Automation**

SortVision seamlessly bridges the gap between digital intelligence and physical action:
*   **Wireless Hardware Control:** The platform utilizes the Web Bluetooth API for robust, low-energy communication with external sorting machinery (e.g., an ESP32-based controller). This allows for precise, programmatic control over the physical sorting process based on AI-driven decisions.
*   **Autonomous Sorting and Self-Improvement Cycle:**
    *   The **Auto-Sort** mode enables a fully autonomous "detect-and-actuate" workflow, minimizing the need for human intervention.
    *   The innovative **Auto-Capture** feature establishes a continuous improvement loop. When the model encounters an object with low classification confidence, it automatically captures and archives a series of images, creating a valuable dataset for subsequent model retraining and accuracy enhancement.

#### **3. Professional-Grade Operational Control and Management**

The user interface is designed for operational efficiency, debugging, and system management:
*   **Dynamic Model Management:** The platform supports a modular AI architecture. Operators can upload, store, and dynamically switch between different machine learning models directly from the settings interface, allowing the system to be rapidly re-tasked for different classification scenarios.
*   **Advanced Camera and Environment Controls:** The interface provides granular control over the device's camera, including flashlight activation and focus lock, enabling optimal data acquisition in challenging lighting and environmental conditions.
*   **System Monitoring and Diagnostics:** A real-time console provides detailed logging of all system events, from AI predictions to hardware commands, facilitating transparent monitoring and rapid diagnostics.

#### **4. Robustness, Security, and Reliability**

The platform is engineered with security and operational resilience as primary considerations:
*   **Secure Access Control:** The application is protected by a mandatory authentication layer to prevent unauthorized access.
*   **Hardened Web Security Posture:** It implements a strict Content-Security-Policy (CSP) and other recommended HTTP security headers (e.g., HSTS, X-Frame-Options) to mitigate common web vulnerabilities such as Cross-Site Scripting (XSS) and clickjacking.
*   **Persistent State and Configuration:** User preferences and automation settings are saved locally, ensuring a consistent operational state across sessions.

---

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

### Adding Sound Files

For the connection and disconnection sounds to work, you need to add two MP3 files to your project:

1. Find two sound files you like for "connect" and "disconnect" notifications.
2. Place them in the `public/` directory.
3. Name them exactly as follows:
    - `public/connect.mp3`
    - `public/disconnect.mp3`

Once these files are in place and you push the changes to GitHub, the sounds will work in your deployed application.
