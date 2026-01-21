
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
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { saveModelToDb, getModelsFromDb, deleteModelFromDb, getModelFromDb, type StoredModel } from "@/lib/model-db";
import { FileUp, BrainCircuit, Loader2, Save, Trash2, Smartphone, TestTube, Bot, Flashlight, RefreshCw, Zap, Bluetooth, BluetoothConnected, Music } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { AppStatus } from "@/lib/types";
import { connectToBluetoothDevice, disconnectFromBluetoothDevice, isConnected } from "@/lib/bluetooth";
import { playConnectedSound, playDisconnectedSound } from "@/lib/audio";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";


interface SortVisionSettingsProps {
  model: tmImage.CustomMobileNet | null;
  setModel: (model: tmImage.CustomMobileNet | null) => void;
  setAppStatus: (status: AppStatus) => void;
  tmImageRef: MutableRefObject<typeof tmImage | null>;
  isTestMode: boolean;
  setIsTestMode: (isTest: boolean) => void;
  wakeLockEnabled: boolean;
  setWakeLockEnabled: (isEnabled: boolean) => void;
  autoCaptureEnabled: boolean;
  setAutoCaptureEnabled: (isEnabled: boolean) => void;
  autoSortEnabled: boolean;
  setAutoSortEnabled: (isEnabled: boolean) => void;
  autoFlashEnabled: boolean;
  setAutoFlashEnabled: (isEnabled: boolean) => void;
  confidenceThreshold: number;
  setConfidenceThreshold: (value: number) => void;
  addLog: (message: string) => void;
}

export default function SortVisionSettings({
  model,
  setModel,
  setAppStatus,
  tmImageRef,
  isTestMode,
  setIsTestMode,
  wakeLockEnabled,
  setWakeLockEnabled,
  autoCaptureEnabled,
  setAutoCaptureEnabled,
  autoSortEnabled,
  setAutoSortEnabled,
  autoFlashEnabled,
  setAutoFlashEnabled,
  confidenceThreshold,
  setConfidenceThreshold,
  addLog,
}: SortVisionSettingsProps) {
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [savedModels, setSavedModels] = useState<StoredModel[]>([]);
  const [newModelName, setNewModelName] = useState("");
  const [modelFiles, setModelFiles] = useState<{ model: File; metadata: File; weights: File } | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isBtConnected, setIsBtConnected] = useState(isConnected());

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const loadModelFromFiles = useCallback(async (modelFile: File, metadataFile: File, weightsFile: File) => {
    setIsModelLoading(true);
    setAppStatus("MODEL_LOADING");
    addLog("Loading model from files...");

    if (!tmImageRef.current) {
      addLog("Model load failed: AI Libraries not ready.");
      toast({ variant: "destructive", title: "Load Error", description: "AI Libraries not ready. Please wait." });
      setIsModelLoading(false);
      setAppStatus("AWAITING_MODEL");
      return;
    }

    try {

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
        setAppStatus("AWAITING_MODEL");
      } else {
        setModel(loadedModel);
        setModelFiles({ model: modelFile, metadata: metadataFile, weights: weightsFile });
        setNewModelName(modelFile.name.replace('.json', ''));
        addLog("Model successfully loaded and validated.");
        toast({ title: "Model Loaded", description: "Teachable Machine model is ready." });
        setAppStatus("AWAITING_OBJECT");
      }

    } catch (error: any) {
      console.error("Model loading error:", error);
      addLog(`Model loading error: ${error.message}`);
      toast({ variant: "destructive", title: "Model Load Error", description: "Could not load the model. Check console for details." });
      setModel(null);
      setAppStatus("AWAITING_MODEL");
    } finally {
      setIsModelLoading(false);
    }
  }, [toast, setAppStatus, addLog, setModel, tmImageRef]);

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
    if (event.target) {
      event.target.value = '';
    }
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
      if (newModelName === name) {
        setModel(null);
        setAppStatus("AWAITING_MODEL");
        setNewModelName("");
        setModelFiles(null);
      }
    } catch (error: any) {
      console.error("Failed to delete model from library:", error);
      addLog(`Failed to delete model from library: ${error.message}`);
      toast({ variant: "destructive", title: "Delete Error", description: `Could not delete "${name}" from the library.` });
    }
  };

  const handleWakeLockToggle = (checked: boolean) => {
    setWakeLockEnabled(checked);
    if (checked) {
      toast({ title: 'Screen lock enabled', description: 'Your screen will try to stay awake.' });
    } else {
      toast({ title: 'Screen lock disabled', description: 'Your screen will now turn off normally.' });
    }
  };

  const handleBluetoothConnect = async () => {
    // @ts-ignore
    if (!navigator.bluetooth) {
      addLog("Web Bluetooth API not available in this browser.");
      toast({ variant: "destructive", title: "Unsupported Browser", description: "Web Bluetooth is not available." });
      return;
    }

    setIsConnecting(true);
    try {
      await connectToBluetoothDevice();
      addLog("Successfully connected to Bluetooth device.");
      toast({ title: "Connected", description: "Sorter is now connected." });
      setIsBtConnected(true);
    } catch (error: any) {
      addLog(`Bluetooth connection failed: ${error.message}`);
      toast({ variant: "destructive", title: "Connection Failed", description: error.message });
      setIsBtConnected(false);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleBluetoothDisconnect = () => {
    disconnectFromBluetoothDevice();
    addLog("Disconnected from Bluetooth device.");
    toast({ title: "Disconnected", description: "Sorter is now disconnected." });
    setIsBtConnected(false);
  };

  useEffect(() => {
    const onConnected = () => setIsBtConnected(true);
    const onDisconnected = () => setIsBtConnected(false);

    window.addEventListener('bt-connected', onConnected);
    window.addEventListener('bt-disconnected', onDisconnected);

    return () => {
      window.removeEventListener('bt-connected', onConnected);
      window.removeEventListener('bt-disconnected', onDisconnected);
    }
  }, []);


  return (
    <Sidebar className="glass border-r border-white/10">
      <SidebarHeader>
        <div className="flex items-center justify-between p-4">
          <h2 className="text-xl font-bold text-gradient">Settings</h2>
          <SidebarClose className="text-muted-foreground hover:text-white" />
        </div>
      </SidebarHeader>
      <SidebarContent className="p-0">
        <TooltipProvider>
          <ScrollArea className="h-full">
            <SidebarGroup>
              <SidebarGroupLabel className="text-primary font-bold uppercase tracking-wider text-xs">Sorter Connection</SidebarGroupLabel>
              <div className="p-4 space-y-4">
                {isBtConnected ? (
                  <Button onClick={handleBluetoothDisconnect} className="w-full shadow-lg hover:shadow-red-500/20" variant="destructive">
                    <BluetoothConnected className="mr-2 h-4 w-4" />
                    Disconnect Sorter
                  </Button>
                ) : (
                  <Button onClick={handleBluetoothConnect} className="w-full shadow-lg hover:shadow-primary/20" disabled={isConnecting}>
                    {isConnecting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Bluetooth className="mr-2 h-4 w-4" />
                    )}
                    Connect to Sorter
                  </Button>
                )}
              </div>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel className="text-primary font-bold uppercase tracking-wider text-xs">Teachable Machine Model</SidebarGroupLabel>
              <div
                onDrop={handleFileDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={cn(
                  "m-4 mt-0 p-6 border-2 border-dashed rounded-xl text-center transition-all duration-300",
                  isDragging ? "border-primary bg-primary/10 scale-105" : "border-white/10 hover:border-primary/50 hover:bg-white/5",
                  (isModelLoading || !tmImageRef.current) && "pointer-events-none opacity-50"
                )}
              >
                <FileUp className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">
                  {isModelLoading
                    ? "Loading model..."
                    : !tmImageRef.current
                      ? "Loading AI libs..."
                      : isDragging
                        ? "Release to upload"
                        : "Drag & drop a .zip or model files"}
                </p>
                <p className="text-xs text-muted-foreground/80">or</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="link"
                      className="p-0 h-auto text-sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isModelLoading || !tmImageRef.current}
                    >
                      click to browse
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Select model.zip, or model.json, metadata.json and weights.bin</p>
                  </TooltipContent>
                </Tooltip>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept=".zip,application/json,.bin"
                  multiple
                  onChange={handleFileSelect}
                  disabled={isModelLoading || !tmImageRef.current}
                />
              </div>
              {modelFiles && (
                <div className="mx-4 mb-4 p-4 border border-white/10 rounded-xl bg-black/20 space-y-3">
                  <Label htmlFor="model-name" className="text-xs font-medium text-muted-foreground">Save to Library</Label>
                  <div className="flex gap-2">
                    <Input
                      id="model-name"
                      value={newModelName}
                      onChange={(e) => setNewModelName(e.target.value)}
                      placeholder="Enter model name..."
                      className="bg-black/20 border-white/10 focus:border-primary/50"
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button onClick={handleSaveModel} size="icon">
                          <Save />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Save current model to library</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              )}
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel className="flex items-center justify-between text-primary font-bold uppercase tracking-wider text-xs">
                Model Library
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={refreshModelsFromDb}>
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Refresh library</p>
                  </TooltipContent>
                </Tooltip>
              </SidebarGroupLabel>
              <div className="p-4 pt-0">
                {savedModels.length > 0 ? (
                  <div className="space-y-2">
                    {savedModels.map(m => (
                      <div key={m.name} className="flex items-center justify-between p-3 bg-black/20 border border-white/5 rounded-lg hover:bg-white/5 transition-colors">
                        <p className="text-sm font-medium truncate" title={m.name}>{m.name}</p>
                        <div className="flex gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleLoadFromLibrary(m.name)} disabled={isModelLoading || !tmImageRef.current}>
                                {isModelLoading ? <Loader2 className="animate-spin" /> : <BrainCircuit />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Load model</p>
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDeleteFromLibrary(m.name)}>
                                <Trash2 />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Delete model</p>
                            </TooltipContent>
                          </Tooltip>
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
              <SidebarGroupLabel className="text-primary font-bold uppercase tracking-wider text-xs">Automation Settings</SidebarGroupLabel>
              <div className="space-y-4 p-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="auto-sort" className="flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Auto-Sort Mode
                  </Label>
                  <Switch
                    id="auto-sort"
                    checked={autoSortEnabled}
                    onCheckedChange={setAutoSortEnabled}
                  />
                </div>
                {autoSortEnabled && (
                  <div className="space-y-3 pt-2">
                    <div className="flex justify-between">
                      <Label className="text-sm">Confidence Threshold</Label>
                      <span className="text-sm font-bold text-primary">{(confidenceThreshold * 100).toFixed(0)}%</span>
                    </div>
                    <Slider
                      value={[confidenceThreshold]}
                      onValueChange={(vals) => setConfidenceThreshold(vals[0])}
                      max={1}
                      min={0.5}
                      step={0.01}
                      className="py-2"
                    />
                    <p className="text-xs text-muted-foreground">
                      Minimum confidence required to trigger auto-sort.
                    </p>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <Label htmlFor="auto-capture" className="flex items-center gap-2">
                    <Bot className="h-4 w-4" />
                    Auto-Capture Unknowns
                  </Label>
                  <Switch
                    id="auto-capture"
                    checked={autoCaptureEnabled}
                    onCheckedChange={setAutoCaptureEnabled}
                  />
                </div>
              </div>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel className="text-primary font-bold uppercase tracking-wider text-xs">Device Settings</SidebarGroupLabel>
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
                  <Label htmlFor="auto-flash" className="flex items-center gap-2">
                    <Flashlight className="h-4 w-4" />
                    Auto Flash on Detect
                  </Label>
                  <Switch
                    id="auto-flash"
                    checked={autoFlashEnabled}
                    onCheckedChange={setAutoFlashEnabled}
                    disabled={!autoSortEnabled}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="test-mode" className="flex items-center gap-2">
                    <TestTube className="h-4 w-4" />
                    Test Mode
                  </Label>                  <Switch
                    id="test-mode"
                    checked={isTestMode}
                    onCheckedChange={setIsTestMode}
                  />
                </div>
              </div>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel className="text-primary font-bold uppercase tracking-wider text-xs">Audio Tests</SidebarGroupLabel>
              <div className="space-y-2 p-4">
                <Button onClick={playConnectedSound} variant="outline" className="w-full">
                  <Music className="mr-2 h-4 w-4" />
                  Test Connect Sound
                </Button>
                <Button onClick={playDisconnectedSound} variant="outline" className="w-full">
                  <Music className="mr-2 h-4 w-4" />
                  Test Disconnect Sound
                </Button>
              </div>
            </SidebarGroup>

          </ScrollArea>
        </TooltipProvider>
      </SidebarContent>
      <SidebarFooter>
        <div className="p-4 pt-0">
          <Button
            variant="outline"
            className="w-full justify-start text-muted-foreground hover:text-primary mb-2"
            asChild
          >
            <a href="/client">
              <Zap className="mr-2 h-4 w-4" />
              Switch to Client View
            </a>
          </Button>
        </div>
        <ThemeToggle />
      </SidebarFooter>
    </Sidebar>
  );
}
