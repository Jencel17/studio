
"use client";

import { useState, useRef, useEffect, useCallback, ChangeEvent, MutableRefObject } from "react";
import type * as tmImage from "@teachablemachine/image";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Sidebar, SidebarContent, SidebarHeader, SidebarGroup, SidebarGroupLabel, SidebarFooter, SidebarClose } from "@/components/ui/sidebar";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { saveModelToDb, getModelsFromDb, deleteModelFromDb, getModelFromDb, type StoredModel } from "@/lib/model-db";
import SortVisionClient from "@/components/sort-vision-client";
import { FileUp, BrainCircuit, Loader2, Save, Trash2, Smartphone, TestTube, Bot, Timer } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { AppStatus } from "@/app/page";
import { LogEntry } from "@/lib/types";

interface SortVisionCoreProps {
    model: tmImage.CustomMobileNet | null;
    setModel: (model: tmImage.CustomMobileNet | null) => void;
    modelLabels: string[];
    setModelLabels: (labels: string[]) => void;
    appStatus: AppStatus;
    setAppStatus: (status: AppStatus) => void;
    wakeLockRef: WakeLockSentinel | null;
    setWakeLockRef: (lock: WakeLockSentinel | null) => void;
    isWakeLockActive: boolean;
    setIsWakeLockActive: (isActive: boolean) => void;
    addLog: (message: string) => void;
    logs: LogEntry[];
    setLogs: (logs: LogEntry[]) => void;
    releaseWakeLock: () => Promise<void>;
    libsLoaded: boolean;
    tmImageRef: MutableRefObject<typeof tmImage | null>;
    tfRef: MutableRefObject<typeof import("@tensorflow/tfjs") | null>;
}

export default function SortVisionCore({
    model,
    setModel,
    modelLabels,
    setModelLabels,
    appStatus,
    setAppStatus,
    wakeLockRef,
    setWakeLockRef,
    isWakeLockActive,
    setIsWakeLockActive,
    addLog,
    logs,
    setLogs,
    releaseWakeLock,
    libsLoaded,
    tmImageRef,
    tfRef
}: SortVisionCoreProps) {
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [savedModels, setSavedModels] = useState<StoredModel[]>([]);
  const [newModelName, setNewModelName] = useState("");
  const [modelFiles, setModelFiles] = useState<{ model: File; metadata: File; weights: File } | null>(null);
  const [esp32Ip, setEsp32Ip] = useState("http://192.168.4.1");
  const [isTestMode, setIsTestMode] = useState(false);
  const [wakeLockEnabled, setWakeLockEnabled] = useState(false);
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(true);
  const [cameraRestartDelay, setCameraRestartDelay] = useState(3);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const loadModelFromFiles = useCallback(async (modelFile: File, metadataFile: File, weightsFile: File) => {
    setIsModelLoading(true);
    setAppStatus("MODEL_LOADING");
    addLog("Loading model from files...");

    if (!tmImageRef.current || !tfRef.current) {
        addLog("Model load failed: AI Libraries not ready.");
        toast({ variant: "destructive", title: "Load Error", description: "AI Libraries not ready. Please wait." });
        setIsModelLoading(false);
        setAppStatus("AWAITING_MODEL");
        return;
    }

    try {
      await tfRef.current.setBackend('webgl');
      await tfRef.current.ready();
      
      const loadedModel = await tmImageRef.current.loadFromFiles(modelFile, weightsFile, metadataFile);
      
      const labels = loadedModel.getClassLabels();
      addLog(`Model loaded with labels: ${labels.join(", ")}`);
      
      if (!labels.some(label => label.toLowerCase() === 'background')) {
        addLog("Model validation failed: Missing 'background' category.");
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
        addLog("Model successfully loaded and validated.");
        toast({ title: "Model Loaded", description: "Teachable Machine model is ready." });
      }
      
    } catch (error: any) {
        console.error("Model loading error:", error);
        addLog(`Model loading error: ${error.message}`);
        toast({ variant: "destructive", title: "Model Load Error", description: "Could not load the model. Check console for details." });
        setModel(null);
        setModelLabels([]);
    } finally {
        setIsModelLoading(false);
        // This relies on the 'model' prop being updated to change the status
        setAppStatus(model ? "AWAITING_OBJECT" : "AWAITING_MODEL");
    }
  }, [toast, setAppStatus, addLog, setModel, setModelLabels, model, tmImageRef, tfRef]);

  const requestWakeLock = useCallback(async () => {
    if ('wakeLock' in navigator && wakeLockEnabled && !wakeLockRef) {
      try {
        addLog("Requesting screen wake lock.");
        const lock = await navigator.wakeLock.request('screen');
        setWakeLockRef(lock);
        setIsWakeLockActive(true);
        addLog("Screen wake lock acquired.");
        lock.addEventListener('release', () => {
          addLog("Screen wake lock released by browser.");
          setWakeLockRef(null);
          setIsWakeLockActive(false);
        });
      } catch (err: any) {
        addLog(`Wake Lock Error: ${err.message}`);
        console.error(`Wake Lock Error: ${err.name}, ${err.message}`);
        setIsWakeLockActive(false);
      }
    }
  }, [wakeLockEnabled, wakeLockRef, addLog, setWakeLockRef, setIsWakeLockActive]);

  const handleFileDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    const files = event.dataTransfer.files;
    if (!files || files.length === 0) {
      return;
    }

    if (files.length === 1 && files[0].name.endsWith('.zip')) {
        const file = files[0];
        addLog(`Processing dropped zip file: ${file.name}`);
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
            addLog(`Zip file error: ${error.message}`);
            toast({ variant: "destructive", title: "Zip File Error", description: "Could not process the zip file. Ensure it's a valid Teachable Machine export." });
        }
    } else {
        addLog(`Processing ${files.length} dropped files.`);
        let droppedModelFile: File | null = null;
        let droppedMetadataFile: File | null = null;
        let droppedWeightsFile: File | null = null;

        Array.from(files).forEach(file => {
            if (file.name === 'model.json') {
                droppedModelFile = file;
            } else if (file.name === 'metadata.json') {
                droppedMetadataFile = file;
            } else if (file.name === 'weights.bin') {
                droppedWeightsFile = file;
            }
        });

        if (droppedModelFile && droppedMetadataFile && droppedWeightsFile) {
             await loadModelFromFiles(droppedModelFile, droppedMetadataFile, droppedWeightsFile);
        } else {
             addLog("Invalid file combination dropped.");
             toast({ variant: "destructive", title: "Invalid Files", description: "Please drop a .zip file or all three model component files." });
        }
    }
  }, [toast, loadModelFromFiles, addLog]);

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
      addLog(`Processing selected zip file: ${file.name}`);
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
        addLog(`Zip file error: ${error.message}`);
        toast({ variant: "destructive", title: "Zip File Error", description: "Could not process the zip file." });
      }
    } else {
       addLog(`Processing ${files.length} selected files.`);
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
         await loadModelFromFiles(selectedModelFile, selectedMetadataFile, selectedWeightsFile);
       } else {
         addLog("Invalid file combination selected.");
         toast({ variant: "destructive", title: "Invalid Files", description: "Select a .zip or all three model component files." });
       }
    }
    event.target.value = '';
  };
  
  const refreshModelsFromDb = useCallback(async () => {
    addLog("Refreshing model library from local DB.");
    const models = await getModelsFromDb();
    setSavedModels(models);
  }, [addLog]);

  useEffect(() => {
    refreshModelsFromDb();
  }, [refreshModelsFromDb]);

  const handleSaveModel = async () => {
    if (!modelFiles || !newModelName) {
      toast({ variant: "destructive", title: "Cannot Save", description: "No model is loaded or name is empty." });
      return;
    }
    try {
      addLog(`Saving model "${newModelName}" to library.`);
      await saveModelToDb(newModelName, modelFiles.model, modelFiles.metadata, modelFiles.weights);
      toast({ title: "Model Saved", description: `"${newModelName}" has been saved to your library.` });
      setNewModelName("");
      setModelFiles(null);
      await refreshModelsFromDb();
    } catch (error: any) {
      console.error("Failed to save model:", error);
      addLog(`Failed to save model: ${error.message}`);
      toast({ variant: "destructive", title: "Save Error", description: "Could not save the model to the local library." });
    }
  };

  const handleLoadFromLibrary = async (name: string) => {
    try {
      addLog(`Loading model "${name}" from library.`);
      const modelData = await getModelFromDb(name);
      if (modelData) {
        await loadModelFromFiles(modelData.model, modelData.metadata, modelData.weights);
      } else {
        throw new Error("Model not found in the database.");
      }
    } catch (error: any) {
      console.error("Failed to load model from library:", error);
      addLog(`Failed to load model from library: ${error.message}`);
      toast({ variant: "destructive", title: "Load Error", description: `Could not load "${name}" from the library.` });
    }
  };

  const handleDeleteFromLibrary = async (name: string) => {
    try {
      addLog(`Deleting model "${name}" from library.`);
      await deleteModelFromDb(name);
      toast({ title: "Model Deleted", description: `"${name}" has been removed from your library.` });
      await refreshModelsFromDb();
    } catch (error: any) {
      console.error("Failed to delete model from library:", error);
      addLog(`Failed to delete model from library: ${error.message}`);
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
                  (isModelLoading || !libsLoaded) && "pointer-events-none opacity-50"
                )}
              >
                <FileUp className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">
                  {isModelLoading 
                    ? "Loading model..." 
                    : !libsLoaded
                    ? "Loading AI libs..."
                    : isDragging 
                    ? "Release to upload" 
                    : "Drag & drop a .zip or model files"}
                </p>
                <p className="text-xs text-muted-foreground/80">or</p>
                <Button 
                  variant="link" 
                  className="p-0 h-auto text-sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isModelLoading || !libsLoaded}
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
                  disabled={isModelLoading || !libsLoaded}
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
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleLoadFromLibrary(m.name)} disabled={isModelLoading || !libsLoaded}>
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
                <div className="space-y-2">
                  <Label htmlFor="restart-delay" className="flex items-center gap-2">
                    <Timer className="h-4 w-4" />
                    Camera Restart Delay (s)
                  </Label>
                  <Input
                    id="restart-delay"
                    type="number"
                    value={cameraRestartDelay}
                    onChange={(e) => setCameraRestartDelay(Math.max(0, Number(e.target.value)))}
                    placeholder="e.g., 3"
                    min="0"
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
          appStatus={appStatus}
          setAppStatus={setAppStatus}
          esp32Ip={esp32Ip}
          isTestMode={isTestMode}
          wakeLockEnabled={wakeLockEnabled}
          requestWakeLock={requestWakeLock}
          releaseWakeLock={releaseWakeLock}
          autoCaptureEnabled={autoCaptureEnabled}
          addLog={addLog}
          logs={logs}
          setLogs={setLogs}
          libsLoaded={libsLoaded}
          cameraRestartDelay={cameraRestartDelay}
          tmImageRef={tmImageRef}
          tfRef={tfRef}
        />
      </div>
    </>
  );
}
