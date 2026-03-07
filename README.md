# SortVision AI

## Formal Project Description for Defense

### **Project Title: SortVision AI: An Autonomous, Edge-Powered Waste Classification and Sorting Platform**

#### **Abstract**
SortVision AI is an integrated hardware and software platform designed to address critical challenges in waste management through intelligent automation. The system leverages on-device machine learning to perform real-time classification of waste materials via a standard smartphone camera. It subsequently interfaces with an external electromechanical sorting apparatus via Web Bluetooth to automate the physical sorting process. The platform is architected as an offline-first Progressive Web App (PWA), ensuring robust, high-availability operation in environments with limited or no internet connectivity. This project demonstrates a cost-effective, scalable, and secure solution for automated waste stream management.

---

### **Core Features and Technical Merits**

#### **1. Professional-Grade Admin Dashboard & Statistics**
The platform now features a comprehensive data management suite for monitoring system performance:
*   **Daily Analytics:** View historical data and trends for past dates directly in the dashboard, powered by persistent local storage synced to Firestore.
*   **Live Sort Monitoring:** See real-time detection and newly sorted items (Recently Sorted) synced from the client device.
*   **Per-Category Tracking:** Detailed statistics for every material type (Paper, Plastic, Metal, Glass, etc.), tracking total items sorted and individual classification accuracy.
*   **Performance Metrics:** Real-time calculation of "Accuracy Rate" (Correct vs. Incorrect) to evaluate model performance in the field.
*   **Visual Analytics:** Integrated bar charts and progress meters for intuitive monitoring of waste distribution.
*   **Data Export Logic:** A one-click export feature that packages all locally saved training images into a structured ZIP file, organized by category for easy model retraining.

#### **2. Smart Data Collection & Self-Improvement Cycle**
SortVision implements a proactive dataset acquisition strategy to continuously improve its AI accuracy:
*   **Burst Capture Before Sorting:** To ensure high-quality training data, the system automatically captures a burst of 10 high-resolution images *before* the sorting mechanism moves the item.
*   **User-Driven Feedback Loops:** If a classification is incorrect, the user can select the correct label. The system immediately saves the pre-captured "gold-standard" images to a local IndexedDB, effectively building an on-site dataset of "edge cases" the model failed on.
*   **Local Image Storage:** Leverages browser-based IndexedDB to store training images locally without requiring cloud storage or internet access, maintaining full data privacy.

#### **3. Dynamic & High-Aesthetic UI/UX**
The user interface is engineered for both clarity and visual impact:
*   **Material-Specific Visuals:** Each waste category is uniquely identified with a specific color palette (e.g., Amber for Paper, Blue for Plastic), distinct emojis/icons, and dynamic gradients.
*   **Intelligent Labeling:** Automatic determination of material status (e.g., "Recyclable", "Compostable", "Special Disposal") based on classification.
*   **Split-Screen Feedback:** A sleek modern interface for classification confirmation, designed for fast interaction on mobile devices.

#### **4. On-Device AI Processing Core**
The cornerstone of the SortVision platform is its edge-based processing architecture:
*   **Real-Time Classification:** Executes a custom-trained TensorFlow.js model (Teachable Machine) directly on the device, achieving sub-100ms inference times.
*   **Offline AI Fallback:** Integrates a pre-trained MobileNet neural network directly into the browser to act as a fallback when the primary model is uncertain. This completely eliminates reliance on external APIs (like Gemini), ensuring zero latency, no rate limits, and 100% offline capability.
*   **Data Privacy and Security:** All image processing occurs locally. No visual data is transmitted externally, ensuring compliance with privacy requirements.
*   **Full Offline Functionality:** Architected for complete operational independence. After initial setup and caching, all core functionalities, including primary and fallback AI, operate without an active internet connection.

#### **5. Advanced System Integration**
*   **Wireless Hardware Control:** Utilizes the Web Bluetooth API for robust communication with ESP32-based sorting machinery.
*   **Auto-Sort Mode:** Enables a fully autonomous "detect-and-actuate" workflow for hands-free sorting.
*   **Device Control:** Granular control over camera focus locks, flashlights, and screen wake locks (Prevent Sleep).

---

### **Robustness, Security, and Reliability**

The platform is engineered with security and operational resilience as primary considerations:
*   **Secure Access Control:** Protected by a mandatory authentication layer.
*   **Hardened Web Security:** Implements strict Content-Security-Policy (CSP) and HSTS.
*   **Progressive Web App (PWA):** Fully installable on iOS and Android devices, starting directly in the dedicated "Client View" for standalone kiosk operation.

---

## How to Deploy to Vercel

### Step 1: Push Your Code to a GitHub Repository

1.  **Create a GitHub Account:** Sign up at [github.com](https://github.com).
2.  **Create a New Repository:** From the GitHub dashboard, create a new repository.
3.  **Upload Your Project:**
    ```bash
    git init -b main
    git add .
    git commit -m "Initial commit"
    git remote add origin <YOUR_GITHUB_REPOSITORY_URL>
    git push -u origin main
    ```

### Step 2: Deploy on Vercel

1.  **Sign Up for Vercel:** Go to [vercel.com](https://vercel.com) and link your GitHub account.
2.  **Import Your Project:** Find your repository and click "**Import**".
3.  **Configure & Deploy:** Vercel automatically detects Next.js. Click "**Deploy**".

### Assets Requirements

Ensure the `public/` directory contains:
- `connect.mp3` & `disconnect.mp3`: Status change audit cues.
- `manifest.json`: PWA configuration.
- `icon-192x192.png` & `icon-512x512.png`: App icons for mobile installation.
<!-- Updated author metadata: Jencel17 / temporado.jencel123@gmail.com -->
