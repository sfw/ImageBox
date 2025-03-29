import React, { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Rect, Line, Transformer } from 'react-konva';
import { Annotation } from '../../../shared/types';
import { v4 as uuidv4 } from 'uuid';
import { KonvaEventObject } from 'konva/lib/Node';
import * as spatialProcessing from '../../packages/spatialProcessing';
import { 
    Box, 
    Button, 
    ToggleButton, 
    ToggleButtonGroup, 
    Paper,
    useTheme,
    IconButton,
    Tooltip
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CancelIcon from '@mui/icons-material/Cancel';
import DeleteIcon from '@mui/icons-material/Delete';
import RectangleOutlinedIcon from '@mui/icons-material/RectangleOutlined';
import GestureIcon from '@mui/icons-material/Gesture';

interface AnnotationCanvasProps {
    imageUrl: string;
    width: number;
    height: number;
    onAnnotationsChange: (annotations: Annotation[]) => void;
    initialAnnotations?: Annotation[];
    onDone: () => void;
    onCancel: () => void;
}

export default function AnnotationCanvas({
    imageUrl,
    width,
    height,
    onAnnotationsChange,
    initialAnnotations = [],
    onDone,
    onCancel
}: AnnotationCanvasProps) {
    const [tool, setTool] = useState<'rectangle' | 'freehand'>('freehand');
    const [annotations, setAnnotations] = useState<Annotation[]>(initialAnnotations);
    const [isDrawing, setIsDrawing] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
    const [canvasSize, setCanvasSize] = useState({ width, height });
    const [imageSize, setImageSize] = useState({ width: 0, height: 0, offsetX: 0, offsetY: 0 });
    const theme = useTheme();
    
    const stageRef = useRef<any>(null);
    const layerRef = useRef<any>(null);
    const transformerRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    
    // Initialize annotations from props
    useEffect(() => {
        setAnnotations(initialAnnotations);
    }, [initialAnnotations]);
    
    // Load image and calculate dimensions for proper scaling
    useEffect(() => {
        if (!imageUrl) return;
        
        const img = new Image();
        img.src = imageUrl;
        img.onload = () => {
            setImageElement(img);
            
            // Update container size if it exists
            updateStageDimensions(img);
            
            // Initial window resize handler
            handleResize();
            
            // Add resize listener
            window.addEventListener('resize', handleResize);
            return () => {
                window.removeEventListener('resize', handleResize);
            };
        };
    }, [imageUrl]);
    
    // Function to handle window resize
    const handleResize = () => {
        if (!imageElement || !containerRef.current) return;
        updateStageDimensions(imageElement);
    };
    
    // Calculate stage dimensions and image offset based on container and image size
    const updateStageDimensions = (img: HTMLImageElement) => {
        if (!containerRef.current) return;
        
        // Get container dimensions
        const containerWidth = containerRef.current.clientWidth;
        const containerHeight = height; // Use fixed height
        
        // Get natural image dimensions
        const imgWidth = img.naturalWidth;
        const imgHeight = img.naturalHeight;
        
        // Calculate image scaling to fit in container while maintaining aspect ratio
        const scale = Math.min(
            containerWidth / imgWidth,
            containerHeight / imgHeight
        );
        
        // Calculate new image dimensions
        const scaledWidth = imgWidth * scale;
        const scaledHeight = imgHeight * scale;
        
        // Calculate offsets to center the image
        const offsetX = (containerWidth - scaledWidth) / 2;
        const offsetY = (containerHeight - scaledHeight) / 2;
        
        // Update state with new dimensions
        setCanvasSize({
            width: containerWidth,
            height: containerHeight
        });
        
        setImageSize({
            width: scaledWidth,
            height: scaledHeight,
            offsetX,
            offsetY
        });
        
        console.log('Canvas dimensions updated:', {
            container: { width: containerWidth, height: containerHeight },
            image: { width: scaledWidth, height: scaledHeight, offsetX, offsetY },
            scale
        });
    };
    
    // Convert stage coordinates to image coordinates relative to the displayed image
    const stageToImageCoords = (stageX: number, stageY: number) => {
        // Calculate relative position within the displayed image
        // First, determine if the point is within the image bounds
        const isOutsideImageX = stageX < imageSize.offsetX || stageX > imageSize.offsetX + imageSize.width;
        const isOutsideImageY = stageY < imageSize.offsetY || stageY > imageSize.offsetY + imageSize.height;
        
        // If outside, clamp to the image edges
        const imageX = isOutsideImageX 
            ? Math.max(imageSize.offsetX, Math.min(stageX, imageSize.offsetX + imageSize.width))
            : stageX;
        const imageY = isOutsideImageY
            ? Math.max(imageSize.offsetY, Math.min(stageY, imageSize.offsetY + imageSize.height))
            : stageY;
        
        return { x: imageX, y: imageY };
    };
    
    // Update transformer when selected annotation changes
    useEffect(() => {
        if (!transformerRef.current || !layerRef.current) return;
        
        if (selectedId === null) {
            transformerRef.current.nodes([]);
            return;
        }
        
        // Find the selected node by id
        const selectedNode = layerRef.current.findOne(`.${selectedId}`);
        if (selectedNode) {
            transformerRef.current.nodes([selectedNode]);
        } else {
            transformerRef.current.nodes([]);
        }
    }, [selectedId]);
    
    // Handle tool change
    const handleToolChange = (
        event: React.MouseEvent<HTMLElement>,
        newTool: 'rectangle' | 'freehand' | null,
    ) => {
        if (newTool !== null) {
            setTool(newTool);
        }
    };
    
    // Process coordinates and calculate normalized values
    const processAnnotation = (annotation: Annotation) => {
        if (!imageElement) return annotation;
        
        // Get the rectangular bounds of the annotation
        let minX, minY, maxX, maxY;
        
        if (annotation.type === 'rectangle') {
            // For rectangles: [x1, y1, x2, y2]
            minX = annotation.coordinates[0];
            minY = annotation.coordinates[1];
            maxX = annotation.coordinates[2];
            maxY = annotation.coordinates[3];
        } else if (annotation.type === 'freehand') {
            // Find bounds for freehand
            minX = Math.min(...annotation.coordinates.filter((_, i) => i % 2 === 0));
            minY = Math.min(...annotation.coordinates.filter((_, i) => i % 2 === 1));
            maxX = Math.max(...annotation.coordinates.filter((_, i) => i % 2 === 0));
            maxY = Math.max(...annotation.coordinates.filter((_, i) => i % 2 === 1));
        } else {
            return annotation; // Unsupported annotation type
        }
        
        console.log(`Raw annotation bounds: (${minX}, ${minY}) to (${maxX}, ${maxY})`);
        
        // Convert stage coordinates to normalized (0-1) image coordinates
        // First, adjust for the image's position in the canvas
        const relMinX = (minX - imageSize.offsetX) / imageSize.width;
        const relMinY = (minY - imageSize.offsetY) / imageSize.height;
        const relMaxX = (maxX - imageSize.offsetX) / imageSize.width;
        const relMaxY = (maxY - imageSize.offsetY) / imageSize.height;
        
        // Ensure coordinates are clamped to the actual image (0-1)
        const normalizedMinX = Math.max(0, Math.min(1, relMinX));
        const normalizedMinY = Math.max(0, Math.min(1, relMinY));
        const normalizedMaxX = Math.max(0, Math.min(1, relMaxX));
        const normalizedMaxY = Math.max(0, Math.min(1, relMaxY));
        
        console.log(`Normalized coordinates: (${normalizedMinX}, ${normalizedMinY}) to (${normalizedMaxX}, ${normalizedMaxY})`);
        
        // Store these normalized coordinates
        annotation.normalizedCoordinates = {
            x1: normalizedMinX,
            y1: normalizedMinY,
            x2: normalizedMaxX,
            y2: normalizedMaxY
        };
        
        // Generate spatial reference using the normalized coordinates
        annotation.spatialReference = spatialProcessing.generateSpatialDescription(
            annotation,
            1, // Width is now 1 (normalized)
            1  // Height is now 1 (normalized)
        );
        
        return annotation;
    };
    
    const handleMouseDown = (e: any) => {
        if (e.target === e.target.getStage()) {
            setSelectedId(null);
            
            const pos = e.target.getStage().getPointerPosition();
            const { x, y } = stageToImageCoords(pos.x, pos.y);
            
            if (tool === 'rectangle') {
                const newAnnotation: Annotation = {
                    id: uuidv4(),
                    type: 'rectangle',
                    coordinates: [x, y, x, y],
                    feedback: ''
                };
                setAnnotations([...annotations, newAnnotation]);
            } else if (tool === 'freehand') {
                const newAnnotation: Annotation = {
                    id: uuidv4(),
                    type: 'freehand',
                    coordinates: [x, y],
                    feedback: ''
                };
                setAnnotations([...annotations, newAnnotation]);
            }
            
            setIsDrawing(true);
        }
    };
    
    const handleMouseMove = (e: any) => {
        if (!isDrawing) return;
        
        const stage = e.target.getStage();
        const pointerPos = stage.getPointerPosition();
        const { x, y } = stageToImageCoords(pointerPos.x, pointerPos.y);
        const lastAnnotation = annotations[annotations.length - 1];
        
        if (tool === 'rectangle') {
            lastAnnotation.coordinates = [
                lastAnnotation.coordinates[0],
                lastAnnotation.coordinates[1],
                x,
                y
            ];
        } else if (tool === 'freehand') {
            lastAnnotation.coordinates = [...lastAnnotation.coordinates, x, y];
        }
        
        // Update annotations
        const newAnnotations = [...annotations];
        newAnnotations[newAnnotations.length - 1] = lastAnnotation;
        setAnnotations(newAnnotations);
    };
    
    const handleMouseUp = () => {
        setIsDrawing(false);
        
        // Process the annotations with normalized coordinates
        const processedAnnotations = annotations.map(processAnnotation);
        setAnnotations(processedAnnotations);
        onAnnotationsChange(processedAnnotations);
    };
    
    const handleDragEnd = (e: any, id: string) => {
        const annotation = annotations.find(a => a.id === id);
        if (!annotation) return;
        
        if (annotation.type === 'rectangle') {
            const node = e.target;
            const newCoordinates = [
                node.x(),
                node.y(),
                node.x() + node.width(),
                node.y() + node.height()
            ];
            annotation.coordinates = newCoordinates;
        } else if (annotation.type === 'freehand') {
            // Calculate shift values
            const node = e.target;
            const oldX = node.x();
            const oldY = node.y();
            const newX = node.attrs.x;
            const newY = node.attrs.y;
            const dx = newX - oldX;
            const dy = newY - oldY;
            
            // Apply shift to all points
            const newCoordinates = [];
            for (let i = 0; i < annotation.coordinates.length; i += 2) {
                newCoordinates.push(annotation.coordinates[i] + dx);
                newCoordinates.push(annotation.coordinates[i + 1] + dy);
            }
            annotation.coordinates = newCoordinates;
        }
        
        // Process annotation to get normalized coordinates and spatial reference
        const processedAnnotation = processAnnotation(annotation);
        
        const newAnnotations = annotations.map(a => 
            a.id === id ? processedAnnotation : a
        );
        
        setAnnotations(newAnnotations);
        onAnnotationsChange(newAnnotations);
    };
    
    const handleTransformEnd = (e: any, id: string) => {
        const annotation = annotations.find(a => a.id === id);
        if (!annotation || annotation.type !== 'rectangle') return;
        
        const node = e.target;
        const newCoordinates = [
            node.x(),
            node.y(),
            node.x() + (node.width() * node.scaleX()),
            node.y() + (node.height() * node.scaleY())
        ];
        
        annotation.coordinates = newCoordinates;
        
        // Reset scale
        node.scaleX(1);
        node.scaleY(1);
        
        // Process annotation to get normalized coordinates and spatial reference
        const processedAnnotation = processAnnotation(annotation);
        
        const newAnnotations = annotations.map(a => 
            a.id === id ? processedAnnotation : a
        );
        
        setAnnotations(newAnnotations);
        onAnnotationsChange(newAnnotations);
    };
    
    const handleDeleteAnnotation = () => {
        if (selectedId === null) return;
        
        const newAnnotations = annotations.filter(a => a.id !== selectedId);
        setAnnotations(newAnnotations);
        setSelectedId(null);
        onAnnotationsChange(newAnnotations);
    };
    
    return (
        <Paper 
            variant="outlined" 
            sx={{ 
                p: 2,
                bgcolor: theme.palette.background.paper,
                borderRadius: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 2
            }}
        >
            {/* Tool selection and controls */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <ToggleButtonGroup
                    value={tool}
                    exclusive
                    onChange={handleToolChange}
                    aria-label="annotation tool"
                    size="small"
                >
                    <ToggleButton value="rectangle" aria-label="rectangle">
                        <Tooltip title="Rectangle">
                            <RectangleOutlinedIcon />
                        </Tooltip>
                    </ToggleButton>
                    <ToggleButton value="freehand" aria-label="freehand">
                        <Tooltip title="Freehand">
                            <GestureIcon />
                        </Tooltip>
                    </ToggleButton>
                </ToggleButtonGroup>
                
                {selectedId && (
                    <Tooltip title="Delete selected annotation">
                        <IconButton 
                            color="error" 
                            onClick={handleDeleteAnnotation}
                            size="small"
                        >
                            <DeleteIcon />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>
            
            {/* Canvas */}
            <div 
                ref={containerRef}
                style={{ 
                    border: `1px solid ${theme.palette.divider}`, 
                    borderRadius: '4px', 
                    overflow: 'hidden',
                    position: 'relative'
                }}
            >
                {/* Background image display */}
                <div style={{
                    width: '100%',
                    height: height,
                    background: `url(${imageUrl}) no-repeat center center`,
                    backgroundSize: 'contain',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    zIndex: 0
                }} />
                
                <Stage
                    width={canvasSize.width}
                    height={canvasSize.height}
                    onMouseDown={handleMouseDown}
                    onMousemove={handleMouseMove}
                    onMouseup={handleMouseUp}
                    style={{ 
                        position: 'relative',
                        zIndex: 1,
                        cursor: isDrawing ? 'crosshair' : 'default',
                        backgroundColor: 'transparent'
                    }}
                    ref={stageRef}
                >
                    <Layer ref={layerRef}>
                        {/* Render rectangles */}
                        {annotations.filter(a => a.type === 'rectangle').map((rect) => {
                            const [x1, y1, x2, y2] = rect.coordinates;
                            return (
                                <Rect
                                    key={rect.id}
                                    x={x1}
                                    y={y1}
                                    width={x2 - x1}
                                    height={y2 - y1}
                                    stroke="#00F0FF"
                                    strokeWidth={2}
                                    dash={[5, 5]}
                                    draggable
                                    name={rect.id}
                                    className={rect.id}
                                    onClick={() => setSelectedId(rect.id)}
                                    onTap={() => setSelectedId(rect.id)}
                                    onDragEnd={(e) => handleDragEnd(e, rect.id)}
                                    onTransformEnd={(e) => handleTransformEnd(e, rect.id)}
                                />
                            );
                        })}
                        
                        {/* Render freehand lines */}
                        {annotations.filter(a => a.type === 'freehand').map((line) => {
                            return (
                                <Line
                                    key={line.id}
                                    points={line.coordinates}
                                    stroke="#FF3D00"
                                    strokeWidth={3}
                                    tension={0.5}
                                    lineCap="round"
                                    lineJoin="round"
                                    draggable
                                    name={line.id}
                                    className={line.id}
                                    onClick={() => setSelectedId(line.id)}
                                    onTap={() => setSelectedId(line.id)}
                                    onDragEnd={(e) => handleDragEnd(e, line.id)}
                                />
                            );
                        })}
                        
                        {/* Transformer for selected annotations */}
                        <Transformer
                            ref={transformerRef}
                            boundBoxFunc={(oldBox, newBox) => {
                                // Limit size
                                if (newBox.width < 5 || newBox.height < 5) {
                                    return oldBox;
                                }
                                return newBox;
                            }}
                        />
                    </Layer>
                </Stage>
            </div>
            
            {/* Action buttons */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                <Button
                    variant="outlined"
                    color="error"
                    startIcon={<CancelIcon />}
                    onClick={onCancel}
                >
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    color="primary"
                    startIcon={<CheckIcon />}
                    onClick={onDone}
                >
                    Done
                </Button>
            </Box>
        </Paper>
    );
} 