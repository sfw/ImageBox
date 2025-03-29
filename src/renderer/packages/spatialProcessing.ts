import { Annotation } from '../../shared/types';

/**
 * Utility for processing spatial information in images and annotations
 * Helps translate visual annotations to textual descriptions with precise positioning
 */

// Image is divided into a 3x3 grid for general positioning
const GRID_SECTIONS = {
  'top-left': { x1: 0, y1: 0, x2: 0.33, y2: 0.33 },
  'top-center': { x1: 0.33, y1: 0, x2: 0.66, y2: 0.33 },
  'top-right': { x1: 0.66, y1: 0, x2: 1, y2: 0.33 },
  'middle-left': { x1: 0, y1: 0.33, x2: 0.33, y2: 0.66 },
  'center': { x1: 0.33, y1: 0.33, x2: 0.66, y2: 0.66 },
  'middle-right': { x1: 0.66, y1: 0.33, x2: 1, y2: 0.66 },
  'bottom-left': { x1: 0, y1: 0.66, x2: 0.33, y2: 1 },
  'bottom-center': { x1: 0.33, y1: 0.66, x2: 0.66, y2: 1 },
  'bottom-right': { x1: 0.66, y1: 0.66, x2: 1, y2: 1 }
};

// For more precise descriptions using percentages
function getPercentagePosition(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * Converts raw rectangle coordinates to normalized coordinates (0-1 range)
 * @param coordinates Raw coordinates from the canvas [x1, y1, width, height]
 * @param imageWidth Width of the image
 * @param imageHeight Height of the image
 */
export function normalizeRectangleCoordinates(
  coordinates: number[], 
  imageWidth: number, 
  imageHeight: number
): { x1: number; y1: number; x2: number; y2: number } {
  // Rectangle format: [x, y, width, height]
  const [x, y, width, height] = coordinates;
  
  return {
    x1: x / imageWidth,
    y1: y / imageHeight,
    x2: (x + width) / imageWidth,
    y2: (y + height) / imageHeight
  };
}

/**
 * Normalizes freehand drawing coordinates
 * @param coordinates Array of points [x1, y1, x2, y2, ...]
 * @param imageWidth Width of the image
 * @param imageHeight Height of the image
 */
export function normalizeFreehandCoordinates(
  coordinates: number[], 
  imageWidth: number, 
  imageHeight: number
): { x1: number; y1: number; x2: number; y2: number } {
  // Find the bounding box of the freehand drawing
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  
  for (let i = 0; i < coordinates.length; i += 2) {
    const x = coordinates[i];
    const y = coordinates[i + 1];
    
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  
  return {
    x1: minX / imageWidth,
    y1: minY / imageHeight,
    x2: maxX / imageWidth,
    y2: maxY / imageHeight
  };
}

/**
 * Gets the closest grid section for the given normalized coordinates
 * @param normalizedCoords Normalized coordinates (0-1 range)
 */
export function getGridSection(normalizedCoords: { x1: number; y1: number; x2: number; y2: number }): string {
  // Calculate the center point of the annotation
  const centerX = (normalizedCoords.x1 + normalizedCoords.x2) / 2;
  const centerY = (normalizedCoords.y1 + normalizedCoords.y2) / 2;
  
  // Find the corresponding grid section
  for (const [sectionName, section] of Object.entries(GRID_SECTIONS)) {
    if (
      centerX >= section.x1 && 
      centerX <= section.x2 && 
      centerY >= section.y1 && 
      centerY <= section.y2
    ) {
      return sectionName;
    }
  }
  
  return 'center'; // Default fallback
}

/**
 * Generates a detailed textual description of an annotation's location
 * @param annotation The annotation with coordinates
 * @param imageWidth Width of the image (for normalization if needed)
 * @param imageHeight Height of the image (for normalization if needed)
 */
export function generateSpatialDescription(
  annotation: Annotation, 
  imageWidth: number, 
  imageHeight: number
): string {
  // Check if normalized coordinates are already provided
  if (!annotation.normalizedCoordinates) {
    // If we receive unit values for width/height, assume coordinates are already normalized
    if (imageWidth === 1 && imageHeight === 1) {
      console.warn('Received unit dimensions but no normalized coordinates');
      return ""; // Can't generate description without normalized coordinates
    }
    
    // Normalize the coordinates based on annotation type
    if (annotation.type === 'rectangle') {
      annotation.normalizedCoordinates = normalizeRectangleCoordinates(
        annotation.coordinates, 
        imageWidth, 
        imageHeight
      );
    } else if (annotation.type === 'freehand' || annotation.type === 'shape') {
      annotation.normalizedCoordinates = normalizeFreehandCoordinates(
        annotation.coordinates, 
        imageWidth, 
        imageHeight
      );
    } else {
      return ""; // Can't generate description without coordinates
    }
  }
  
  const coords = annotation.normalizedCoordinates;
  
  // IMPORTANT: Ensure coordinates are clamped to valid range (0-1)
  const clampedCoords = {
    x1: Math.max(0, Math.min(1, coords.x1)),
    y1: Math.max(0, Math.min(1, coords.y1)),
    x2: Math.max(0, Math.min(1, coords.x2)),
    y2: Math.max(0, Math.min(1, coords.y2))
  };
  
  // Get general grid section based on the clamped coordinates
  const gridSection = getGridSection(clampedCoords);
  
  // Get specific percentage positions, making sure they're within 0-100%
  const left = getPercentagePosition(clampedCoords.x1);
  const top = getPercentagePosition(clampedCoords.y1);
  const right = getPercentagePosition(clampedCoords.x2);
  const bottom = getPercentagePosition(clampedCoords.y2);
  const width = getPercentagePosition(clampedCoords.x2 - clampedCoords.x1);
  const height = getPercentagePosition(clampedCoords.y2 - clampedCoords.y1);
  
  // Create a detailed spatial description
  let description = `in the ${gridSection} of the image `;
  
  // Add more precise positioning
  if (annotation.type === 'rectangle') {
    description += `(a rectangle from ${left} left, ${top} top to ${right} right, ${bottom} bottom, `;
    description += `with dimensions ${width} wide by ${height} tall)`;
  } else if (annotation.type === 'freehand') {
    description += `(a freehand drawing within a region from ${left} left, ${top} top to ${right} right, ${bottom} bottom)`;
  } else if (annotation.type === 'shape') {
    description += `(a shape within a region from ${left} left, ${top} top to ${right} right, ${bottom} bottom)`;
  }
  
  return description;
}

/**
 * Generates a detailed description of all annotations on an image
 * @param annotations Array of annotations
 * @param imageWidth Width of the image
 * @param imageHeight Height of the image
 */
export function generateAnnotationsDescription(
  annotations: Annotation[], 
  imageWidth: number, 
  imageHeight: number
): string {
  if (!annotations || annotations.length === 0) {
    return "";
  }
  
  const descriptions = annotations.map((annotation, index) => {
    // Get or generate spatial description
    const spatialDescription = annotation.spatialReference || 
      generateSpatialDescription(annotation, imageWidth, imageHeight);
    
    // Save the spatial reference for future use
    annotation.spatialReference = spatialDescription;
    
    return `Region ${index + 1}: ${spatialDescription}. Feedback: ${annotation.feedback}`;
  });
  
  return descriptions.join("\n\n");
}

/**
 * Generates a comprehensive prompt for image refinement that includes
 * detailed positional information for each annotation and the vision-generated description
 */
export function generateRefinementPrompt(
  originalImage: { 
    prompt: string; 
    description?: string; 
    width: number; 
    height: number; 
  },
  annotations: Annotation[],
  globalFeedback?: string
): string {
  // Start with a shorter, more direct explanation of the refinement process
  let prompt = "# IMAGE REFINEMENT\n\n";
  
  // Include the original prompt for context - keep this brief
  prompt += `## ORIGINAL: "${originalImage.prompt}"\n\n`;
  
  // Add the GPT-4 Vision detailed description of the current image, but don't include the full text
  // Instead, we'll reference it and assume it's already in the context from the refineImage function
  if (originalImage.description) {
    // Only include a short reference to the vision analysis to save characters
    prompt += "## REFERENCE IMAGE ANALYSIS\n";
    
    // Truncate description if it's too long (aim for about 800 chars max)
    const maxDescLength = 800;
    const truncatedDesc = originalImage.description.length > maxDescLength 
      ? originalImage.description.substring(0, maxDescLength) + "..." 
      : originalImage.description;
    
    prompt += `${truncatedDesc}\n\n`;
  }
  
  // Add global feedback if provided - keep it concise
  if (globalFeedback && globalFeedback.trim()) {
    prompt += "## GLOBAL CHANGES\n";
    prompt += `${globalFeedback}\n\n`;
  }
  
  // Add specific annotation feedback with spatial information - limit detail
  if (annotations && annotations.length > 0) {
    prompt += "## REGION CHANGES\n";
    prompt += generateAnnotationsDescription(annotations, originalImage.width, originalImage.height);
    prompt += "\n\n";
  }
  
  // Simplified refinement instructions
  prompt += "## APPROACH\n";
  prompt += "1. Use reference analysis as base\n";
  prompt += "2. Apply specified changes\n";
  prompt += "3. Maintain composition and style consistency\n";
  
  return prompt;
}

/**
 * Estimates image dimensions from standard size formats
 * @param imageSize Size in format "widthxheight" (e.g., "1024x1024")
 */
export function estimateImageDimensions(imageSize: string): { width: number; height: number } {
  const [width, height] = imageSize.split('x').map(Number);
  return { width, height };
} 