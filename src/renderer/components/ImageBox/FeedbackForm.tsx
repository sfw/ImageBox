import React, { useState } from 'react';
import { Annotation } from '../../../shared/types';
import { 
    Box, 
    Button, 
    Typography, 
    TextField, 
    Paper, 
    Chip,
    IconButton,
    Divider,
    useTheme,
    Card,
    CardContent,
    CardHeader
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import LightbulbIcon from '@mui/icons-material/Lightbulb';

interface FeedbackFormProps {
    annotations: Annotation[];
    onFeedbackChange: (annotations: Annotation[]) => void;
    onSubmit: () => void;
    onCancel: () => void;
    globalFeedback?: string;
    onGlobalFeedbackChange?: (feedback: string) => void;
}

// Simplified feedback quick actions
const QUICK_ACTIONS = [
    'MAKE BRIGHTER',
    'MAKE DARKER',
    'ADD MORE DETAIL',
    'CHANGE COLOR',
    'REMOVE THIS',
];

export default function FeedbackForm({
    annotations,
    onFeedbackChange,
    onSubmit,
    onCancel,
    globalFeedback = '',
    onGlobalFeedbackChange,
}: FeedbackFormProps) {
    const [annotationsWithFeedback, setAnnotationsWithFeedback] = useState<Annotation[]>(annotations);
    const [globalFeedbackValue, setGlobalFeedbackValue] = useState<string>(globalFeedback);
    const [showFeedback, setShowFeedback] = useState<boolean>(true);
    const theme = useTheme();

    const handleAnnotationFeedbackChange = (id: string, feedback: string) => {
        const updatedAnnotations = annotationsWithFeedback.map(ann => {
            if (ann.id === id) {
                return { ...ann, feedback };
            }
            return ann;
        });
        
        setAnnotationsWithFeedback(updatedAnnotations);
        onFeedbackChange(updatedAnnotations);
    };

    const handleGlobalFeedbackChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setGlobalFeedbackValue(e.target.value);
        if (onGlobalFeedbackChange) {
            onGlobalFeedbackChange(e.target.value);
        }
    };

    const handleQuickAction = (id: string, action: string) => {
        handleAnnotationFeedbackChange(id, action.toLowerCase());
    };

    const toggleFeedback = () => {
        setShowFeedback(!showFeedback);
    };

    const combineAllFeedback = (): string => {
        let result = '';
        
        if (globalFeedbackValue) {
            result += globalFeedbackValue + '\n\n';
        }
        
        const annotationsWithFeedbackText = annotationsWithFeedback.filter(a => a.feedback);
        if (annotationsWithFeedbackText.length > 0) {
            annotationsWithFeedbackText.forEach((ann, index) => {
                result += `${index + 1}: ${ann.feedback}\n`;
            });
        }
        
        return result.trim();
    };

    return (
        <Paper 
            variant="outlined" 
            sx={{ 
                bgcolor: theme.palette.background.paper,
                borderRadius: 1,
                mb: 2
            }}
        >
            <Box sx={{ p: 2, maxWidth: '100%' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                    <Button
                        variant="outlined"
                        color="primary"
                        startIcon={showFeedback ? <VisibilityOffIcon /> : <VisibilityIcon />}
                        onClick={toggleFeedback}
                    >
                        {showFeedback ? 'Hide Feedback' : 'Show Feedback'}
                    </Button>
                    
                    <Box sx={{ display: 'flex', gap: 1 }}>
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
                            startIcon={<SaveIcon />}
                            onClick={onSubmit}
                        >
                            Save
                        </Button>
                    </Box>
                </Box>
                
                {showFeedback && (
                    <Box>
                        <Typography variant="h6" sx={{ mb: 2 }}>
                            Feedback
                        </Typography>
                        
                        {annotationsWithFeedback.map((annotation, index) => (
                            <Card 
                                key={annotation.id} 
                                variant="outlined" 
                                sx={{ 
                                    mb: 2,
                                    bgcolor: theme.palette.action.hover
                                }}
                            >
                                <CardContent>
                                    <Typography 
                                        variant="subtitle1" 
                                        color="primary" 
                                        sx={{ mb: 1 }}
                                    >
                                        Annotation #{index + 1} ({annotation.type})
                                    </Typography>
                                    
                                    <Box sx={{ mb: 2 }}>
                                        <Typography variant="caption" color="primary.light" sx={{ display: 'block', mb: 0.5 }}>
                                            Your feedback
                                        </Typography>
                                        <TextField
                                            fullWidth
                                            multiline
                                            rows={2}
                                            variant="outlined"
                                            size="small"
                                            value={annotation.feedback || ''}
                                            onChange={(e) => handleAnnotationFeedbackChange(annotation.id, e.target.value)}
                                            placeholder="Enter feedback for this area..."
                                            sx={{ 
                                                bgcolor: theme.palette.background.paper,
                                                '& .MuiOutlinedInput-root': {
                                                    '& fieldset': {
                                                        borderColor: theme.palette.divider,
                                                    },
                                                },
                                            }}
                                        />
                                    </Box>
                                    
                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                        {QUICK_ACTIONS.map((action, i) => (
                                            <Chip
                                                key={i}
                                                label={action}
                                                onClick={() => handleQuickAction(annotation.id, action)}
                                                clickable
                                                color="primary"
                                                variant="outlined"
                                                size="small"
                                            />
                                        ))}
                                    </Box>
                                </CardContent>
                            </Card>
                        ))}
                        
                        {annotationsWithFeedback.length === 0 && (
                            <Paper 
                                variant="outlined" 
                                sx={{ 
                                    p: 2, 
                                    mb: 3, 
                                    textAlign: 'center',
                                    bgcolor: theme.palette.action.hover
                                }}
                            >
                                <Typography color="text.secondary">
                                    No annotations found. Draw on the image to create annotations.
                                </Typography>
                            </Paper>
                        )}
                        
                        <Box sx={{ mt: 3 }}>
                            <Typography variant="subtitle1" color="primary.light" sx={{ mb: 1 }}>
                                Global Feedback (applies to entire image)
                            </Typography>
                            <TextField
                                fullWidth
                                multiline
                                rows={3}
                                variant="outlined"
                                value={globalFeedbackValue}
                                onChange={handleGlobalFeedbackChange}
                                placeholder="Enter feedback for the entire image..."
                                sx={{ 
                                    bgcolor: theme.palette.background.paper,
                                    '& .MuiOutlinedInput-root': {
                                        '& fieldset': {
                                            borderColor: theme.palette.divider,
                                        },
                                    },
                                }}
                            />
                        </Box>
                    </Box>
                )}
            </Box>
        </Paper>
    );
} 