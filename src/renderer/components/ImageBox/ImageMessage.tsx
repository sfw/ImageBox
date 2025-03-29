import React, { useState, useEffect } from 'react';
import { Annotation, Message } from '../../../shared/types';
import AnnotationCanvas from './AnnotationCanvas';
import FeedbackForm from './FeedbackForm';
import { v4 as uuidv4 } from 'uuid';
import * as spatialProcessing from '../../packages/spatialProcessing';
import { 
    Button, 
    Typography, 
    Box, 
    CircularProgress, 
    Paper, 
    Divider, 
    Card, 
    CardContent, 
    CardMedia, 
    IconButton,
    useTheme
} from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import EditIcon from '@mui/icons-material/Edit';
import CasinoIcon from '@mui/icons-material/Casino';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

interface ImageMessageProps {
    message: Message;
    onRefineImage: (message: Message, annotations: Annotation[], globalFeedback: string, refinementPrompt: string) => void;
    onRerollImage?: (message: Message) => void;
}

export default function ImageMessage({ message, onRefineImage, onRerollImage }: ImageMessageProps) {
    const [isAnnotating, setIsAnnotating] = useState(false);
    const [showFeedbackForm, setShowFeedbackForm] = useState(false);
    const [annotations, setAnnotations] = useState<Annotation[]>(message.annotations || []);
    const [globalFeedback, setGlobalFeedback] = useState('');
    const [showVersionHistory, setShowVersionHistory] = useState(false);
    const [refinementPrompt, setRefinementPrompt] = useState('');
    const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
    const [showFullDescription, setShowFullDescription] = useState(false);
    const [showFullPrompt, setShowFullPrompt] = useState(false);
    const theme = useTheme();
    
    // Debug log when component renders
    useEffect(() => {
        console.log('ImageMessage component rendered with props:', {
            messageId: message.id,
            imageUrl: message.imageUrl,
            generating: message.generating,
            originalPrompt: message.originalPrompt,
            history: message.history?.length || 0
        });
    }, [message.id, message.imageUrl, message.generating]);
    
    if (!message.imageUrl && !message.generating) {
        console.log('ImageMessage: No image URL or generating state, not rendering', message.id);
        return null;
    }
    
    const handleAnnotate = () => {
        // Clear existing annotations when starting a new annotation session
        // We only want to show previous annotations during rerolls, not for new refinements
        setAnnotations([]); // Reset annotations to empty array
        setIsAnnotating(true);
    };
    
    const handleAnnotationsDone = () => {
        setIsAnnotating(false);
        setShowFeedbackForm(true);
    };
    
    const handleAnnotationsCancel = () => {
        setIsAnnotating(false);
    };
    
    const handleAnnotationsChange = (newAnnotations: Annotation[]) => {
        // Get image dimensions - estimate from image element or use defaults
        const imageElement = document.querySelector(`img[src="${message.imageUrl}"]`) as HTMLImageElement;
        const imageWidth = imageElement?.naturalWidth || 1024;
        const imageHeight = imageElement?.naturalHeight || 1024;
        
        // Process spatial information for each annotation
        const processedAnnotations = newAnnotations.map(annotation => {
            // Generate spatial reference if not already present
            if (!annotation.spatialReference) {
                annotation.spatialReference = spatialProcessing.generateSpatialDescription(
                    annotation, 
                    imageWidth, 
                    imageHeight
                );
            }
            return annotation;
        });
        
        setAnnotations(processedAnnotations);
    };
    
    const handleFeedbackSubmit = () => {
        setShowFeedbackForm(false);
        
        // Get image dimensions - estimate from image element or use defaults
        const imageElement = document.querySelector(`img[src="${message.imageUrl}"]`) as HTMLImageElement;
        const imageWidth = imageElement?.naturalWidth || 1024;
        const imageHeight = imageElement?.naturalHeight || 1024;
        
        // Construct a human-readable refinement prompt that describes the changes
        let prompt = '';
        
        // Add global feedback if present
        if (globalFeedback) {
            prompt += `${globalFeedback}\n\n`;
        }
        
        // Process all annotations to ensure they have spatial references
        const processedAnnotations = annotations.map((ann, idx) => {
            // Generate spatial reference if not already present
            if (!ann.spatialReference) {
                ann.spatialReference = spatialProcessing.generateSpatialDescription(
                    ann, 
                    imageWidth, 
                    imageHeight
                );
            }
            
            // Add annotation-specific feedback with spatial reference
            if (ann.feedback) {
                prompt += `${idx + 1}: ${ann.spatialReference} - ${ann.feedback}\n`;
            }
            
            return ann;
        });
        
        // Save the refinement prompt
        setRefinementPrompt(prompt);
        
        // Pass both annotations and global feedback to parent
        onRefineImage(message, processedAnnotations, globalFeedback, prompt);
    };
    
    const handleFeedbackCancel = () => {
        setShowFeedbackForm(false);
    };
    
    const toggleVersionHistory = () => {
        setShowVersionHistory(!showVersionHistory);
    };
    
    const handleThumbnailClick = (imageUrl: string) => {
        setSelectedVersion(imageUrl);
    };
    
    const returnToCurrentVersion = () => {
        setSelectedVersion(null);
    };
    
    const handleReroll = () => {
        if (onRerollImage) {
            onRerollImage(message);
        }
    };
    
    // Determine which image to display
    const displayImageUrl = selectedVersion || message.imageUrl || '';
    
    // Determine if we're showing a historical version
    const isHistoricalVersion = selectedVersion !== null;

    // Get all versions including current, but filter out any invalid URLs
    const allVersions: string[] = (message.history || [])
        .filter(url => url && url.trim() !== ''); // Filter out empty or undefined URLs
        
    // Add current version if it's valid and not already in the history
    if (message.imageUrl && !allVersions.includes(message.imageUrl)) {
        allVersions.push(message.imageUrl);
    }
    
    // Debug log to check message props
    useEffect(() => {
        console.log('ImageMessage detail:', {
            messageId: message.id,
            originalPrompt: message.originalPrompt,
            refinementPrompt: message.refinementPrompt,
            generating: message.generating,
            imageUrl: message.imageUrl,
            annotationsCount: annotations.length,
            versionsCount: allVersions.length
        });
    }, [message, annotations.length]);
    
    // Loading spinner component
    const LoadingSpinner = () => (
        <Box sx={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            bgcolor: 'background.paper', 
            borderRadius: 1, 
            overflow: 'hidden', 
            width: '100%', 
            height: 400 
        }}>
            <CircularProgress />
        </Box>
    );
    
    return (
        <Box sx={{ position: 'relative' }}>
            {/* Floating Version History panel */}
            {showVersionHistory && allVersions.length > 0 && (
                <Paper
                    elevation={3}
                    sx={{
                        position: 'fixed',
                        right: '16px',
                        top: '80px',
                        width: '200px',
                        maxHeight: 'calc(100vh - 120px)',
                        overflowY: 'auto',
                        zIndex: 1300,
                        p: 2,
                        bgcolor: theme.palette.background.paper,
                        borderRadius: 1,
                        border: `1px solid ${theme.palette.divider}`,
                        boxShadow: 3
                    }}
                >
                    <Typography variant="h6" sx={{ mb: 2, fontWeight: 'bold' }}>
                        Version History
                    </Typography>
                    
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {allVersions.map((url, index) => {
                            // Skip rendering if url is empty or undefined
                            if (!url) return null;
                            
                            // Calculate actual version number (starting from 1)
                            const versionNumber = index + 1;
                            
                            const isSelected = url === displayImageUrl;
                            const isCurrent = url === message.imageUrl;
                            
                            return (
                                <Card 
                                    key={url || index} 
                                    variant="outlined" 
                                    sx={{ 
                                        mb: 1, 
                                        borderColor: isSelected ? 'primary.main' : 'divider',
                                        borderWidth: isSelected ? 2 : 1,
                                        cursor: 'pointer',
                                        '&:hover': {
                                            borderColor: 'primary.main'
                                        }
                                    }}
                                    onClick={() => isCurrent ? returnToCurrentVersion() : handleThumbnailClick(url)}
                                >
                                    <Box sx={{ position: 'relative' }}>
                                        <CardMedia
                                            component="img"
                                            image={url}
                                            alt={`Version ${versionNumber}`}
                                            sx={{ 
                                                width: '100%',
                                                height: 'auto',
                                                objectFit: 'cover'
                                            }}
                                        />
                                        <Box sx={{ 
                                            position: 'absolute', 
                                            bottom: 0, 
                                            left: 0, 
                                            right: 0, 
                                            py: 0.5, 
                                            px: 1, 
                                            textAlign: 'center',
                                            bgcolor: isSelected ? 'primary.main' : 'rgba(0, 0, 0, 0.6)',
                                            color: 'white'
                                        }}>
                                            <Typography variant="caption">
                                                {isCurrent ? 'Current' : `V${versionNumber}`}
                                            </Typography>
                                        </Box>
                                    </Box>
                                </Card>
                            );
                        })}
                    </Box>
                </Paper>
            )}

            {/* Main content area (full width always) */}
            <Box>
                {/* Content area based on current mode */}
                {isAnnotating && message.imageUrl ? (
                    <AnnotationCanvas
                        imageUrl={message.imageUrl}
                        width={800}
                        height={600}
                        onAnnotationsChange={handleAnnotationsChange}
                        initialAnnotations={annotations}
                        onDone={handleAnnotationsDone}
                        onCancel={handleAnnotationsCancel}
                    />
                ) : showFeedbackForm ? (
                    <FeedbackForm
                        annotations={annotations}
                        onFeedbackChange={handleAnnotationsChange}
                        onSubmit={handleFeedbackSubmit}
                        onCancel={handleFeedbackCancel}
                        globalFeedback={globalFeedback}
                        onGlobalFeedbackChange={setGlobalFeedback}
                    />
                ) : (
                    <Box>
                        {/* Image display or loading spinner */}
                        {message.generating ? (
                            <LoadingSpinner />
                        ) : message.imageUrl ? (
                            <Paper 
                                elevation={0} 
                                sx={{ 
                                    position: 'relative', 
                                    bgcolor: 'background.paper', 
                                    borderRadius: 1, 
                                    overflow: 'hidden',
                                    border: `1px solid ${theme.palette.divider}`
                                }}
                            >
                                <img
                                    src={displayImageUrl}
                                    alt={message.originalPrompt || "Generated image"}
                                    style={{ 
                                        maxWidth: '100%', 
                                        maxHeight: 600, 
                                        margin: '0 auto', 
                                        display: 'block' 
                                    }}
                                />
                            </Paper>
                        ) : null}
                        
                        {/* Action buttons - moved below the image */}
                        <Box sx={{ display: 'flex', gap: 1, mt: 2, mb: 2 }}>
                            {!message.generating && (
                                <>
                                    <Button
                                        variant="contained"
                                        color="primary"
                                        startIcon={<EditIcon />}
                                        onClick={handleAnnotate}
                                        disabled={isAnnotating || showFeedbackForm || !message.imageUrl}
                                    >
                                        Annotate
                                    </Button>
                                    
                                    {onRerollImage && (
                                        <Button
                                            variant="contained"
                                            color="secondary"
                                            startIcon={<CasinoIcon />}
                                            onClick={handleReroll}
                                            disabled={isAnnotating || showFeedbackForm}
                                        >
                                            Reroll
                                        </Button>
                                    )}
                                </>
                            )}
                            
                            <Button
                                variant={showVersionHistory ? "contained" : "outlined"}
                                color="inherit"
                                startIcon={<HistoryIcon />}
                                onClick={toggleVersionHistory}
                                disabled={allVersions.length <= 1}
                            >
                                {showVersionHistory ? "Hide History" : "Version History"}
                            </Button>
                        </Box>
                        
                        {/* Prompt and refinement info */}
                        <Box sx={{ mt: 2, color: 'text.secondary', fontSize: '0.875rem' }}>
                            {message.originalPrompt && (
                                <Box sx={{ mb: 1 }}>
                                    <Typography variant="body2" component="span" sx={{ fontWeight: 'bold' }}>
                                        Generated from prompt:
                                    </Typography>{' '}
                                    <Typography variant="body2" component="span">
                                        {message.originalPrompt}
                                    </Typography>
                                </Box>
                            )}
                            
                            {message.imageDescription && !isHistoricalVersion && (
                                <Paper 
                                    variant="outlined" 
                                    sx={{ 
                                        mt: 2, 
                                        p: 2, 
                                        bgcolor: 'background.paper',
                                        borderLeft: 4,
                                        borderColor: 'success.main'
                                    }}
                                >
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Typography variant="subtitle1" color="success.dark" sx={{ fontWeight: 'bold' }}>
                                            Comprehensive Image Analysis
                                        </Typography>
                                        <Button 
                                            variant="text" 
                                            size="small"
                                            onClick={() => setShowFullDescription(!showFullDescription)}
                                            endIcon={showFullDescription ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                                        >
                                            {showFullDescription ? "Show Summary" : "Show Full Analysis"}
                                        </Button>
                                    </Box>
                                    
                                    {showFullDescription ? (
                                        <Box sx={{ mt: 1, color: 'text.primary', whiteSpace: 'pre-line' }}>
                                            <Typography variant="body2">
                                                {message.imageDescription}
                                            </Typography>
                                        </Box>
                                    ) : (
                                        <Box sx={{ mt: 1, color: 'text.primary' }}>
                                            <Typography variant="body2">
                                                A detailed analysis of the image composition, lighting, color, texture, and spatial relationships is available to help AI models accurately understand and refine this image.
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                                                (Click "Show Full Analysis" to view the complete details)
                                            </Typography>
                                        </Box>
                                    )}
                                </Paper>
                            )}
                            
                            {message.refinementPrompt && !isHistoricalVersion && (
                                <Paper 
                                    variant="outlined" 
                                    sx={{ 
                                        mt: 2, 
                                        p: 2, 
                                        bgcolor: 'background.paper',
                                        borderLeft: 4,
                                        borderColor: 'primary.main'
                                    }}
                                >
                                    <Typography variant="subtitle1" color="primary.dark" sx={{ fontWeight: 'bold' }}>
                                        Refinement:
                                    </Typography>
                                    
                                    {/* Display refinement instructions as bullet points */}
                                    <Box component="ul" sx={{ pl: 3, mt: 1 }}>
                                        {message.refinementPrompt.split('\n').filter(line => line.trim()).map((line, idx) => (
                                            <Typography component="li" variant="body2" key={idx} sx={{ my: 0.5, color: 'text.primary' }}>
                                                {line}
                                            </Typography>
                                        ))}
                                    </Box>
                                </Paper>
                            )}
                            
                            {/* Full Model Prompt section */}
                            {message.fullPrompt && !isHistoricalVersion && (
                                <Paper 
                                    variant="outlined" 
                                    sx={{ 
                                        mt: 2, 
                                        p: 2, 
                                        bgcolor: 'background.paper',
                                        borderLeft: 4,
                                        borderColor: 'info.main'
                                    }}
                                >
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Typography variant="subtitle1" color="info.dark" sx={{ fontWeight: 'bold' }}>
                                            Model Prompt
                                        </Typography>
                                        <Button 
                                            variant="text" 
                                            size="small"
                                            onClick={() => setShowFullPrompt(!showFullPrompt)}
                                            endIcon={showFullPrompt ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                                        >
                                            {showFullPrompt ? "Hide Prompt" : "Show Full Prompt"}
                                        </Button>
                                    </Box>
                                    
                                    {showFullPrompt ? (
                                        <Box sx={{ mt: 1, color: 'text.primary', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.8rem', backgroundColor: 'background.default', p: 1, borderRadius: 1, overflow: 'auto', maxHeight: '400px' }}>
                                            <Typography variant="body2" component="pre" sx={{ margin: 0 }}>
                                                {message.fullPrompt}
                                            </Typography>
                                        </Box>
                                    ) : (
                                        <Box sx={{ mt: 1, color: 'text.primary' }}>
                                            <Typography variant="body2">
                                                The complete prompt sent to the image generation model includes all refinements, annotations, and spatial descriptions.
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                                                (Click "Show Full Prompt" to view the exact text sent to the model)
                                            </Typography>
                                        </Box>
                                    )}
                                </Paper>
                            )}
                            
                            {message.generating && (
                                <Box sx={{ mt: 2, color: 'primary.main' }}>
                                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                        Generating image... This may take a few moments.
                                    </Typography>
                                </Box>
                            )}
                        </Box>
                    </Box>
                )}
            </Box>
        </Box>
    );
} 