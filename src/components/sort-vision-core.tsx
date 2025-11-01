
"use client";

import { useState, useRef, useEffect, useCallback, ChangeEvent } from "react";
import type * as tmImage from "@teachablemachine/image";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Sidebar, SidebarContent, SidebarHeader, SidebarTrigger, SidebarGroup, SidebarGroupLabel, SidebarFooter, SidebarClose } from "@/components/ui/sidebar";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { saveModelToDb, getModelsFromDb, deleteModelFromDb, getModelFromDb, type StoredModel } from "@/lib/model-db";
import SortVisionClient from "@/components/sort-vision-client";
import { FileUp, BrainCircuit, Loader2, Save, Trash2, Smartphone, TestTube, Bot } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";

export default function SortVisionCore() {
  const [model, setModel] = useState<tmImage.CustomMobileNet | null>(null);
  const [modelLabels, setModelLabels] = useState<string[]>([]);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [savedModels, setSavedModels] = useState<StoredModel[]>([]);
  const [newModelName, setNewModelName] = useState("");
  const [modelFiles, setModelFiles] = useState<{ model: File; metadata: File; weights: File } | null>(null);
  const [esp32Ip, setEsp32Ip] = useState("http://192.168.4.1");
  const [isTestMode, setIsTestMode] = useState(false);
  const [wakeLockEnabled, setWakeLockEnabled] = useState(false);
  const [wakeLockRef, setWakeLockRef] = useState<WakeLockSentinel | null>(null);
  const [isWakeLockActive, setIsWakeLockActive] = useState(false);
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  
  const tmImageRef = useRef<typeof tmImage | null>(null);
  const tfRef = useRef<typeof import("@tensorflow/tfjs") | null>(null);
  
  const addLog = (message: string) => {
    // This is a placeholder. The real addLog is in SortVisionClient.
    // The client component will manage its own logs.
    console.log(`[LOG] ${new Date().toLocaleTimeString()}: ${message}`);
  };

  const loadModelFromFiles = useCallback(async (modelFile: File, metadataFile: File, weightsFile: File) => {
    setIsModelLoading(true);
    addLog("Loading Teachable Machine model from files...");

    if (!tmImageRef.current || !tfRef.current) {
        // AI libs need to be loaded by the client first.
        // This is a fallback in case the button is enabled before libs are ready.
        toast({ variant: "destructive", title: "Load Error", description: "AI Libraries not ready. Please wait." });
        setIsModelLoading(false);
        return;
    }

    try {
      addLog("Setting TensorFlow backend to 'webgl'.");
      await tfRef.current.setBackend('webgl');
      await tfRef.current.ready();
      addLog("TensorFlow is ready.");
      
      addLog("Starting model load from files.");
      const loadedModel = await tmImageRef.current.loadFromFiles(modelFile, weightsFile, metadataFile);
      addLog("Model files loaded into memory.");
      
      const labels = loadedModel.getClassLabels();
      
      if (!labels.some(label => label.toLowerCase() === 'background')) {
        addLog("Error: Model does not contain a 'background' category. Model rejected.");
        toast({
          variant: "destructive",
          title: "Invalid Model: Missing 'background' category",
          description: "The loaded model must include a class named 'background' to work correctly. Please train and export a new model.",
          duration: 9000,
        });
        setModel(null);
        setModelLabels([]);
      } else {
        setModel(loadedModel);
        setModelLabels(labels);
        setModelFiles({ model: modelFile, metadata: metadataFile, weights: weightsFile });
        setNewModelName(modelFile.name.replace('.json', ''));
        addLog(`Model loaded successfully. Classes: ${labels.join(', ')}`);
        toast({ title: "Model Loaded", description: "Teachable Machine model is ready." });
      }
      
    } catch (error: any) {
        console.error("Model loading error:", error);
        addLog(`Model loading failed: ${error.message}`);
        toast({ variant: "destructive", title: "Model Load Error", description: "Could not load the model. Check console for details." });
        setModel(null);
        setModelLabels([]);
    } finally {
        setIsModelLoading(false);
        addLog("Model loading process finished.");
    }
  }, [toast]);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef) {
      try {
        await wakeLockRef.release();
        setWakeLockRef(null);
        setIsWakeLockActive(false);
        addLog("Screen wake lock released.");
      } catch (error: any) {
        console.error("Could not release wake lock:", error);
        addLog(`Error releasing wake lock: ${error.message}`);
      }
    }
  }, [wakeLockRef]);

  const requestWakeLock = useCallback(async () => {
    if ('wakeLock' in navigator && wakeLockEnabled && !wakeLockRef) {
      try {
        const lock = await navigator.wakeLock.request('screen');
        setWakeLockRef(lock);
        setIsWakeLockActive(true);
        addLog("Screen wake lock acquired.");
        lock.addEventListener('release', () => {
          setWakeLockRef(null);
          setIsWakeLockActive(false);
          addLog("Wake Lock was released by the system.");
        });
      } catch (err: any) {
        console.error(`Wake Lock Error: ${err.name}, ${err.message}`);
        addLog(`Wake Lock Error: ${err.message}`);
        setIsWakeLockActive(false);
      }
    }
  }, [wakeLockEnabled, wakeLockRef]);

  const handleFileDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    addLog("Files dropped.");

    const files = event.dataTransfer.files;
    if (!files || files.length === 0) {
      addLog("No files found in drop event.");
      return;
    }

    if (files.length === 1 && files[0].name.endsWith('.zip')) {
        const file = files[0];
        addLog(`Zip file detected: ${file.name}. Unpacking...`);
        try {
            const zip = await JSZip.loadAsync(file);
            const modelJsonFile = zip.file("model.json");
            const weightsBinFile = zip.file("weights.bin");
            const metadataJsonFile = zip.file("metadata.json");

            if (!modelJsonFile || !metadataJsonFile || !weightsBinFile) {
                throw new Error("model.json, weights.bin, or metadata.json not found in the zip file.");
            }

            const modelBlob = await modelJsonFile.async("blob");
            const weightsBlob = await weightsBinFile.async("blob");
            const metadataBlob = await metadataJsonFile.async("blob");

            const modelFile = new File([modelBlob], "model.json", { type: "application/json" });
            const weightsFile = new File([weightsBlob], "weights.bin", { type: "application/octet-stream" });
            const metadataFile = new File([metadataBlob], "metadata.json", { type: "application/json" });
            
            await loadModelFromFiles(modelFile, metadataFile, weightsFile);

        } catch (error: any) {
            console.error("Zip file processing error:", error);
            addLog(`Error processing zip file: ${error.message}`);
            toast({ variant: "destructive", title: "Zip File Error", description: "Could not process the zip file. Ensure it's a valid Teachable Machine export." });
        }
    } else {
        let droppedModelFile: File | null = null;
        let droppedMetadataFile: File | null = null;
        let droppedWeightsFile: File | null = null;

        Array.from(files).forEach(file => {
            if (file.name === 'model.json') {
                droppedModelFile = file;
                addLog('model.json found.');
            } else if (file.name === 'metadata.json') {
                droppedMetadataFile = file;
                addLog('metadata.json found.');
            } else if (file.name === 'weights.bin') {
                droppedWeightsFile = file;
                addLog('weights.bin found.');
            }
        });

        if (droppedModelFile && droppedMetadataFile && droppedWeightsFile) {
             addLog('All model components found. Loading model.');
             await loadModelFromFiles(droppedModelFile, droppedMetadataFile, droppedWeightsFile);
        } else {
             addLog("Dropped files are not a valid model. Please drop a .zip file or model.json, metadata.json and weights.bin together.");
             toast({ variant: "destructive", title: "Invalid Files", description: "Please drop a .zip file or all three model component files." });
        }
    }
  }, [addLog, toast, loadModelFromFiles]);

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (files.length === 1 && files[0].name.endsWith('.zip')) {
      const file = files[0];
      addLog(`Zip file selected: ${file.name}. Unpacking...`);
      try {
        const zip = await JSZip.loadAsync(file);
        const modelJsonFile = zip.file("model.json");
        const weightsBinFile = zip.file("weights.bin");
        const metadataJsonFile = zip.file("metadata.json");

        if (!modelJsonFile || !metadataJsonFile || !weightsBinFile) {
          throw new Error("model.json, weights.bin, or metadata.json not found in the zip file.");
        }

        const modelBlob = await modelJsonFile.async("blob");
        const weightsBlob = await weightsBinFile.async("blob");
        const metadataBlob = await metadataJsonFile.async("blob");

        const modelFile = new File([modelBlob], "model.json", { type: "application/json" });
        const weightsFile = new File([weightsBlob], "weights.bin", { type: "application/octet-stream" });
        const metadataFile = new File([metadataBlob], "metadata.json", { type: "application/json" });
        
        await loadModelFromFiles(modelFile, metadataFile, weightsFile);
      } catch (error: any) {
        console.error("Zip file processing error:", error);
        addLog(`Error processing zip file: ${error.message}`);
        toast({ variant: "destructive", title: "Zip File Error", description: "Could not process the zip file." });
      }
    } else {
       let selectedModelFile: File | null = null;
       let selectedMetadataFile: File | null = null;
       let selectedWeightsFile: File | null = null;

       Array.from(files).forEach(file => {
         if (file.name === 'model.json') {
           selectedModelFile = file;
         } else if (file.name === 'metadata.json') {
           selectedMetadataFile = file;
         } else if (file.name === 'weights.bin') {
            selectedWeightsFile = file;
         }
       });

       if (selectedModelFile && selectedMetadataFile && selectedWeightsFile) {
         addLog('All model components selected. Loading model.');
         await loadModelFromFiles(selectedModelFile, selectedMetadataFile, selectedWeightsFile);
       } else {
         addLog("Invalid file selection. Please select a .zip file, or model.json, metadata.json and weights.bin.");
         toast({ variant: "destructive", title: "Invalid Files", description: "Select a .zip or all three model component files." });
       }
    }
    event.target.value = '';
  };
  
  const refreshModelsFromDb = useCallback(async () => {
    addLog("Refreshing model list from local DB...");
    const models = await getModelsFromDb();
    setSavedModels(models);
    addLog(`Found ${models.length} saved models.`);
  }, []);

  useEffect(() => {
    refreshModelsFromDb();
  }, [refreshModelsFromDb]);

  const handleSaveModel = async () => {
    if (!modelFiles || !newModelName) {
      toast({ variant: "destructive", title: "Cannot Save", description: "No model is loaded or name is empty." });
      return;
    }
    try {
      addLog(`Saving model "${newModelName}" to local library...`);
      await saveModelToDb(newModelName, modelFiles.model, modelFiles.metadata, modelFiles.weights);
      toast({ title: "Model Saved", description: `"${newModelName}" has been saved to your library.` });
      setNewModelName("");
      setModelFiles(null);
      await refreshModelsFromDb();
    } catch (error: any) {
      console.error("Failed to save model:", error);
      addLog(`Error saving model: ${error.message}`);
      toast({ variant: "destructive", title: "Save Error", description: "Could not save the model to the local library." });
    }
  };

  const handleLoadFromLibrary = async (name: string) => {
    setIsModelLoading(true);
    addLog(`Loading model "${name}" from library...`);
    try {
      const modelData = await getModelFromDb(name);
      if (modelData) {
        await loadModelFromFiles(modelData.model, modelData.metadata, modelData.weights);
      } else {
        throw new Error("Model not found in the database.");
      }
    } catch (error: any) {
      console.error("Failed to load model from library:", error);
      addLog(`Error loading model: ${error.message}`);
      toast({ variant: "destructive", title: "Load Error", description: `Could not load "${name}" from the library.` });
    } finally {
        setIsModelLoading(false);
    }
  };

  const handleDeleteFromLibrary = async (name: string) => {
    try {
      addLog(`Deleting model "${name}" from library...`);
      await deleteModelFromDb(name);
      toast({ title: "Model Deleted", description: `"${name}" has been removed from your library.` });
      await refreshModelsFromDb();
    } catch (error: any) {
      console.error("Failed to delete model from library:", error);
      addLog(`Error deleting model: ${error.message}`);
      toast({ variant: "destructive", title: "Delete Error", description: `Could not delete "${name}" from the library.` });
    }
  };

  const handleWakeLockToggle = (checked: boolean) => {
    setWakeLockEnabled(checked);
    if (checked) {
      requestWakeLock();
      toast({ title: 'Screen lock enabled', description: 'Your screen will try to stay awake.' });
    } else {
      releaseWakeLock();
      toast({ title: 'Screen lock disabled', description: 'Your screen will now turn off normally.' });
    }
  };

  return (
    <>
      <Sidebar>
        <SidebarHeader>
            <div className="flex items-center justify-between p-2">
              <h2 className="text-lg font-semibold">Settings</h2>
              <SidebarClose />
            </div>
        </SidebarHeader>
        <SidebarContent className="p-0">
          <ScrollArea className="h-full">
            <SidebarGroup>
              <SidebarGroupLabel>Teachable Machine Model</SidebarGroupLabel>
              <div 
                onDrop={handleFileDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={cn(
                  "m-4 mt-0 p-4 border-2 border-dashed rounded-lg text-center transition-colors duration-200",
                  isDragging ? "border-primary bg-primary/10" : "border-border",
                  isModelLoading && "pointer-events-none opacity-50"
                )}
              >
                <FileUp className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">
                  {isModelLoading 
                    ? "Loading model..." 
                    : isDragging 
                    ? "Release to upload" 
                    : "Drag & drop a .zip or model files"}
                </p>
                <p className="text-xs text-muted-foreground/80">or</p>
                <Button 
                  variant="link" 
                  className="p-0 h-auto text-sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isModelLoading}
                >
                  click to browse
                </Button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept=".zip,model.json,metadata.json,application/octet-stream"
                  multiple
                  onChange={handleFileSelect}
                  disabled={isModelLoading}
                />
              </div>
              {modelFiles && (
                <div className="mx-4 mb-4 p-4 border rounded-lg bg-muted/30 space-y-3">
                    <Label htmlFor="model-name">Save to Library</Label>
                    <div className="flex gap-2">
                        <Input 
                            id="model-name"
                            value={newModelName}
                            onChange={(e) => setNewModelName(e.target.value)}
                            placeholder="Enter model name..."
                        />
                        <Button onClick={handleSaveModel} size="icon">
                            <Save />
                        </Button>
                    </div>
                </div>
              )}
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Model Library</SidebarGroupLabel>
              <div className="p-4 pt-0">
                {savedModels.length > 0 ? (
                  <div className="space-y-2">
                    {savedModels.map(m => (
                      <div key={m.name} className="flex items-center justify-between p-2 bg-muted/30 rounded-md">
                        <p className="text-sm font-medium truncate">{m.name}</p>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleLoadFromLibrary(m.name)} disabled={isModelLoading}>
                            {isModelLoading ? <Loader2 className="animate-spin"/> : <BrainCircuit />}
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDeleteFromLibrary(m.name)}>
                            <Trash2 />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center p-4">No models saved locally.</p>
                )}
              </div>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Network Settings</SidebarGroupLabel>
              <div className="space-y-2 p-4">
                <Label htmlFor="esp32-ip">ESP32 IP Address</Label>
                <Input
                  id="esp32-ip"
                  value={esp32Ip}
                  onChange={(e) => setEsp32Ip(e.target.value)}
                  placeholder="e.g., http://192.168.4.1"
                  disabled={isTestMode}
                />
              </div>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Device Settings</SidebarGroupLabel>
              <div className="space-y-4 p-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="keep-awake" className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4" />
                    Keep Screen Awake
                  </Label>
                  <Switch
                    id="keep-awake"
                    checked={wakeLockEnabled}
                    onCheckedChange={handleWakeLockToggle}
                  />
                </div>
                 <div className="flex items-center justify-between">
                  <Label htmlFor="auto-capture" className="flex items-center gap-2">
                    <Bot className="h-4 w-4" />
                    Auto-Capture
                  </Label>
                  <Switch
                    id="auto-capture"
                    checked={autoCaptureEnabled}
                    onCheckedChange={setAutoCaptureEnabled}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="test-mode" className="flex items-center gap-2">
                    <TestTube className="h-4 w-4" />
                    Test Mode
                  </Label>
                  <Switch
                    id="test-mode"
                    checked={isTestMode}
                    onCheckedChange={setIsTestMode}
                  />
                </div>
              </div>
            </SidebarGroup>
          </ScrollArea>
        </SidebarContent>
        <SidebarFooter>
          <ThemeToggle />
        </SidebarFooter>
      </Sidebar>

      <div className="grid min-h-screen flex-1 place-items-center p-4 sm:p-6">
        <SortVisionClient
          model={model}
          setModel={setModel}
          modelLabels={modelLabels}
          isModelLoading={isModelLoading}
          esp32Ip={esp32Ip}
          isTestMode={isTestMode}
          wakeLockEnabled={wakeLockEnabled}
          requestWakeLock={requestWakeLock}
          releaseWakeLock={releaseWakeLock}
          tmImageRef={tmImageRef}
          tfRef={tfRef}
          autoCaptureEnabled={autoCaptureEnabled}
        />
      </div>
    </>
  );
}
