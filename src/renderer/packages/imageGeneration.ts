import { ImageSize, ImageGenerationModel, StableDiffusionProvider } from '../../shared/types';
import * as imageStorage from './imageStorage';
import * as spatialProcessing from './spatialProcessing';
import { Annotation } from '../../shared/types';

// Default API endpoints - will be overridden from settings when available
const DEFAULT_OPENAI_API_ENDPOINT = 'https://api.openai.com/v1/images/generations';
const DEFAULT_SD_LOCAL_ENDPOINT = 'http://localhost:7860/sdapi/v1/txt2img';
const STABLEDIFFUSIONAPI_ENDPOINT = 'https://stablediffusionapi.com/api/v3/text2img';
const REPLICATE_ENDPOINT = 'https://api.replicate.com/v1/predictions';

interface ImageGenerationOptions {
  prompt: string;
  size: ImageSize;
  model: ImageGenerationModel;
  apiKey?: string;
  apiEndpoint?: string;
  stableDiffusionHost?: string;
  stableDiffusionProvider?: StableDiffusionProvider;
  stableDiffusionAPIKey?: string;
  sessionId: string;
  negativePrompt?: string;
  numberOfImages?: number;
  style?: 'vivid' | 'natural'; // New DALL-E 3 parameter
  quality?: 'standard' | 'hd';  // New DALL-E 3 parameter
  imageDescription?: string;
  imageUrl?: string;
  uploadPreviousImage?: boolean; // For GPT-4o: whether to upload the previous image
}

interface ImageGenerationResult {
  success: boolean;
  imageUrl: string;
  localImagePath?: string;
  error?: string;
  fullPrompt?: string;
}

/**
 * Generate an image using OpenAI DALL-E
 */
async function generateWithDalle(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
  try {
    if (!options.apiKey) {
      throw new Error('API key is required for DALL-E image generation');
    }

    const endpoint = options.apiEndpoint || DEFAULT_OPENAI_API_ENDPOINT;
    const modelName = options.model === ImageGenerationModel.DALLE3 ? 'dall-e-3' : 'dall-e-2';
    
    const requestBody: any = {
      model: modelName,
      prompt: options.prompt,
      n: 1,
      size: options.size,
      response_format: 'url'
    };
    
    // Add DALL-E 3 specific parameters if applicable
    if (modelName === 'dall-e-3') {
      if (options.style) {
        requestBody.style = options.style;
      }
      
      if (options.quality) {
        requestBody.quality = options.quality;
      }
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${options.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`DALL-E API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const imageUrl = data.data?.[0]?.url;

    if (!imageUrl) {
      throw new Error('No image URL returned from DALL-E API');
    }

    // Save the image locally
    const localImageUrl = await imageStorage.saveImageFromUrl(imageUrl, options.sessionId);

    return {
      success: true,
      imageUrl: localImageUrl,
      localImagePath: localImageUrl
    };
  } catch (error) {
    console.error('DALL-E image generation failed:', error);
    return {
      success: false,
      imageUrl: '',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Generate an image using GPT-4o capabilities
 * Note: GPT-4o doesn't directly generate images, so we'll use the DALL-E 3 endpoint
 */
async function generateWithGPT4o(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
  try {
    if (!options.apiKey) {
      return {
        success: false,
        imageUrl: '',
        error: 'API key is required for GPT-4o image generation'
      };
    }

    console.log('Generating image with GPT-4o:', options.prompt);
    
    // Extract the base API host from the apiEndpoint if available
    let baseApiUrl = 'https://api.openai.com';
    if (options.apiEndpoint) {
      // If apiEndpoint is provided, extract just the host part
      try {
        const url = new URL(options.apiEndpoint);
        baseApiUrl = `${url.protocol}//${url.host}`;
      } catch (e) {
        console.warn('Failed to parse apiEndpoint, using default OpenAI API URL', e);
      }
    }
    
    // First, use GPT-4o to enhance the prompt if requested
    let enhancedPrompt = options.prompt;
    
    if (options.uploadPreviousImage && options.imageUrl) {
      try {
        enhancedPrompt = await enhancePromptWithGPT4o(options);
        console.log('Enhanced prompt with GPT-4o:', enhancedPrompt.substring(0, 100) + '...');
      } catch (error) {
        console.error('Error enhancing prompt with GPT-4o:', error);
        // Continue with original prompt if enhancement fails
      }
    }
    
    // Now, generate the image using DALL-E 3 endpoint
    const endpoint = `${baseApiUrl}/v1/images/generations`;
    console.log('Using images generation endpoint:', endpoint);
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${options.apiKey}`
    };

    // Create the request body for DALL-E 3 image generation
    const requestBody = {
      model: 'dall-e-3',
      prompt: enhancedPrompt,
      n: 1,
      size: options.size,
      quality: options.quality || 'standard',
      style: options.style || 'vivid'
    };

    console.log('Sending DALL-E request with prompt enhanced by GPT-4o');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`DALL-E API Error: ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    
    // Extract the image URL from the response
    const imageUrl = data.data?.[0]?.url;
    
    if (!imageUrl) {
      throw new Error('No image URL found in DALL-E response');
    }
    
    console.log('Got image URL from DALL-E:', imageUrl);
    
    // Save the image locally
    const localImageUrl = await imageStorage.saveImageFromUrl(imageUrl, options.sessionId);
    
    return {
      success: true,
      imageUrl: localImageUrl,
      localImagePath: localImageUrl
    };
  } catch (error) {
    console.error('GPT-4o image generation failed:', error);
    return {
      success: false,
      imageUrl: '',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Use GPT-4o to enhance a prompt based on a previous image
 */
async function enhancePromptWithGPT4o(options: ImageGenerationOptions): Promise<string> {
  // Extract the base API host from the apiEndpoint if available
  let baseApiUrl = 'https://api.openai.com';
  if (options.apiEndpoint) {
    try {
      const url = new URL(options.apiEndpoint);
      baseApiUrl = `${url.protocol}//${url.host}`;
    } catch (e) {
      console.warn('Failed to parse apiEndpoint, using default OpenAI API URL', e);
    }
  }
  
  const endpoint = `${baseApiUrl}/v1/chat/completions`;
  console.log('Using chat completions endpoint for prompt enhancement:', endpoint);
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${options.apiKey}`
  };

  // Prepare messages
  const messages = [];
  
  // Add system message
  messages.push({
    role: 'system',
    content: `You are an expert prompt enhancer for image generation. Your task is to analyze an image and the user's prompt, then create a detailed, vivid prompt that captures both the essence of the original image and incorporates the user's requested changes. Focus on artistic style, composition, lighting, and important details.`
  });

  // Create the content array for the user message
  const userContent = [];
  
  // Add text content
  userContent.push({
    type: 'text',
    text: `I want to generate a new image based on this reference image. 
    
Original prompt: "${options.prompt}"

Please create an enhanced, detailed prompt that incorporates all the important visual elements from the reference image while applying the changes I'm requesting in my prompt. Make the description vivid and detailed - around 100-200 words.`
  });

  // Include the image if we have a valid URL
  if (options.imageUrl) {
    try {
      let imageData;
      if (options.imageUrl.startsWith('file://')) {
        // This is a local file path
        try {
          // For Electron renderer process, we can use fetch for local files
          const response = await fetch(options.imageUrl);
          const blob = await response.blob();
          imageData = await blobToBase64(blob);
        } catch (err) {
          console.error('Error reading local file with fetch:', err);
          // Fall back to using the URL directly if it's accessible
          imageData = options.imageUrl;
        }
      } else if (options.imageUrl.startsWith('data:')) {
        // Already a data URL
        imageData = options.imageUrl;
      } else {
        // External URL, fetch it
        const response = await fetch(options.imageUrl);
        const blob = await response.blob();
        imageData = await blobToBase64(blob);
      }

      // Add the image to the content
      userContent.push({
        type: 'image_url',
        image_url: {
          url: imageData
        }
      });
      
      console.log('Previous image included in GPT-4o prompt enhancement request');
    } catch (error) {
      console.error('Error including previous image:', error);
      // Continue without the image
    }
  } else {
    console.log('No previous image URL provided for GPT-4o prompt enhancement');
  }

  // Add the user message
  messages.push({
    role: 'user',
    content: userContent
  });

  // Make the API request
  const requestBody = {
    model: 'gpt-4o',
    messages: messages,
    temperature: 0.7,
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`GPT-4o API Error: ${JSON.stringify(errorData)}`);
  }

  const data = await response.json();
  
  // Extract the enhanced prompt from the response
  const enhancedPrompt = data.choices[0]?.message?.content;
  
  if (!enhancedPrompt) {
    throw new Error('No enhanced prompt returned from GPT-4o');
  }
  
  return enhancedPrompt;
}

/**
 * Generate an image using Stable Diffusion API
 */
async function generateWithStableDiffusion(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
  try {
    // Determine which provider to use
    const provider = options.stableDiffusionProvider || StableDiffusionProvider.Local;
    
    // Use the appropriate API endpoint based on the provider
    switch (provider) {
      case StableDiffusionProvider.Local:
        return generateWithLocalStableDiffusion(options);
      case StableDiffusionProvider.StableDiffusionAPI:
        return generateWithStableDiffusionAPI(options);
      case StableDiffusionProvider.Replicate:
        return generateWithReplicate(options);
      case StableDiffusionProvider.Custom:
        return generateWithCustomStableDiffusion(options);
      default:
        // Fall back to local if unknown provider
        return generateWithLocalStableDiffusion(options);
    }
  } catch (error) {
    console.error('Stable Diffusion image generation failed:', error);
    return {
      success: false,
      imageUrl: '',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Generate an image using local Stable Diffusion API (A1111/WebUI or similar)
 */
async function generateWithLocalStableDiffusion(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
  try {
    // Construct the full API endpoint using the host from options or default
    const baseHost = options.stableDiffusionHost || 'http://localhost:7860';
    const endpoint = `${baseHost}/sdapi/v1/txt2img`;
    
    // Parse dimensions from size string (e.g., "1024x1024")
    const [width, height] = options.size.split('x').map(Number);
    
    const requestBody = {
      prompt: options.prompt,
      negative_prompt: options.negativePrompt || '',
      width,
      height,
      num_images: options.numberOfImages || 1,
      sampler_name: 'DPM++ 2M Karras',
      steps: 30
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`Stable Diffusion API error: ${response.statusText}`);
    }

    const data = await response.json();
    const base64Image = data.images?.[0];

    if (!base64Image) {
      throw new Error('No image returned from Stable Diffusion API');
    }

    // Convert base64 to data URL
    const dataUrl = `data:image/png;base64,${base64Image}`;
    
    // Save the image locally
    const localImageUrl = await imageStorage.saveImageFromDataUrl(dataUrl, options.sessionId);
    
    return {
      success: true,
      imageUrl: localImageUrl,
      localImagePath: localImageUrl
    };
  } catch (error) {
    console.error('Local Stable Diffusion API failed:', error);
    return {
      success: false,
      imageUrl: '',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Generate an image using StableDiffusionAPI.com API
 */
async function generateWithStableDiffusionAPI(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
  try {
    if (!options.stableDiffusionAPIKey) {
      throw new Error('API key is required for StableDiffusionAPI.com');
    }

    // Parse dimensions from size string (e.g., "1024x1024")
    const [width, height] = options.size.split('x').map(Number);
    
    const endpoint = STABLEDIFFUSIONAPI_ENDPOINT;
    
    const requestBody = {
      key: options.stableDiffusionAPIKey,
      prompt: options.prompt,
      negative_prompt: options.negativePrompt || '',
      width: String(width),
      height: String(height),
      samples: String(options.numberOfImages || 1),
      num_inference_steps: "30",
      guidance_scale: 7.5,
      safety_checker: "yes",
      webhook: null,
      track_id: null
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();
    
    if (data.status !== 'success') {
      throw new Error(`StableDiffusionAPI.com error: ${data.message || 'Unknown error'}`);
    }

    const imageUrl = data.output?.[0];

    if (!imageUrl) {
      throw new Error('No image URL returned from StableDiffusionAPI.com');
    }

    // Save the image locally
    const localImageUrl = await imageStorage.saveImageFromUrl(imageUrl, options.sessionId);

    return {
      success: true,
      imageUrl: localImageUrl,
      localImagePath: localImageUrl
    };
  } catch (error) {
    console.error('StableDiffusionAPI.com generation failed:', error);
    return {
      success: false,
      imageUrl: '',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Generate an image using Replicate API
 */
async function generateWithReplicate(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
  try {
    if (!options.stableDiffusionAPIKey) {
      throw new Error('API key is required for Replicate');
    }

    // Parse dimensions from size string (e.g., "1024x1024")
    const [width, height] = options.size.split('x').map(Number);
    
    const endpoint = REPLICATE_ENDPOINT;
    
    // Using the standard stability-ai/stable-diffusion model from Replicate
    const requestBody = {
      version: "db21e45d3f7023abc2a46ee38a23973f6dce16bb082a930b0c49861f96d1e5bf", // Stable Diffusion v1.5 model
      input: {
        prompt: options.prompt,
        negative_prompt: options.negativePrompt || '',
        width: width,
        height: height,
        num_outputs: options.numberOfImages || 1,
        num_inference_steps: 30,
        guidance_scale: 7.5
      }
    };

    // Start the prediction
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${options.stableDiffusionAPIKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Replicate API error: ${errorData.detail || response.statusText}`);
    }

    const prediction = await response.json();
    
    // Replicate API is asynchronous, so we need to poll for results
    const predictionUrl = prediction.urls?.get;
    if (!predictionUrl) {
      throw new Error('Invalid response from Replicate');
    }
    
    // Poll for results (with a timeout)
    let result;
    const maxAttempts = 30; // 30 attempts * 2 second wait = 60 second max wait time
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const pollResponse = await fetch(predictionUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Token ${options.stableDiffusionAPIKey}`
        }
      });
      
      result = await pollResponse.json();
      
      if (result.status === 'succeeded') {
        break;
      } else if (result.status === 'failed') {
        throw new Error(`Replicate generation failed: ${result.error || 'Unknown error'}`);
      }
      
      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    if (!result || result.status !== 'succeeded') {
      throw new Error('Timed out waiting for Replicate to generate image');
    }
    
    const imageUrl = result.output?.[0];
    
    if (!imageUrl) {
      throw new Error('No image URL returned from Replicate');
    }

    // Save the image locally
    const localImageUrl = await imageStorage.saveImageFromUrl(imageUrl, options.sessionId);

    return {
      success: true,
      imageUrl: localImageUrl,
      localImagePath: localImageUrl
    };
  } catch (error) {
    console.error('Replicate generation failed:', error);
    return {
      success: false,
      imageUrl: '',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Generate an image using a custom Stable Diffusion API
 */
async function generateWithCustomStableDiffusion(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
  try {
    if (!options.stableDiffusionHost) {
      throw new Error('Host URL is required for custom Stable Diffusion API');
    }

    // Parse dimensions from size string (e.g., "1024x1024")
    const [width, height] = options.size.split('x').map(Number);
    
    const endpoint = options.stableDiffusionHost;
    
    // Start with basic parameters, assuming a standard API interface
    const requestBody: any = {
      prompt: options.prompt,
      negative_prompt: options.negativePrompt || '',
      width,
      height,
      num_images: options.numberOfImages || 1,
      steps: 30
    };
    
    // Add API key if provided
    if (options.stableDiffusionAPIKey) {
      requestBody.key = options.stableDiffusionAPIKey;
    }

    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };
    
    // Add Authorization header if API key is provided
    if (options.stableDiffusionAPIKey) {
      headers['Authorization'] = `Bearer ${options.stableDiffusionAPIKey}`;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`Custom Stable Diffusion API error: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Try to find the image in the response - this is flexible as different APIs might have different response formats
    let imageUrl = null;
    
    // Common response formats
    if (data.output && typeof data.output === 'string') {
      imageUrl = data.output;
    } else if (data.output && Array.isArray(data.output) && data.output.length > 0) {
      imageUrl = data.output[0];
    } else if (data.images && Array.isArray(data.images) && data.images.length > 0) {
      // A1111-style API might return base64 images
      const base64Image = data.images[0];
      if (typeof base64Image === 'string') {
        if (base64Image.startsWith('data:')) {
          // Already a data URL
          const localImageUrl = await imageStorage.saveImageFromDataUrl(base64Image, options.sessionId);
          return {
            success: true,
            imageUrl: localImageUrl,
            localImagePath: localImageUrl
          };
        } else {
          // Just base64, convert to data URL
          const dataUrl = `data:image/png;base64,${base64Image}`;
          const localImageUrl = await imageStorage.saveImageFromDataUrl(dataUrl, options.sessionId);
          return {
            success: true,
            imageUrl: localImageUrl,
            localImagePath: localImageUrl
          };
        }
      }
    } else if (data.result && typeof data.result === 'string') {
      imageUrl = data.result;
    } else if (data.url && typeof data.url === 'string') {
      imageUrl = data.url;
    }

    if (!imageUrl) {
      throw new Error('No image URL found in custom API response');
    }

    // Save the image locally
    const localImageUrl = await imageStorage.saveImageFromUrl(imageUrl, options.sessionId);

    return {
      success: true,
      imageUrl: localImageUrl,
      localImagePath: localImageUrl
    };
  } catch (error) {
    console.error('Custom Stable Diffusion API failed:', error);
    return {
      success: false,
      imageUrl: '',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Generate an image using the specified model
 */
export async function generateImage(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
  // Initialize image storage if not already done
  await imageStorage.initImageStorage();
  
  // Store the prompt used for image generation
  const fullPrompt = options.prompt;
  
  // Choose the appropriate generation method based on the model
  let result;
  if (options.model === ImageGenerationModel.DALLE3 || options.model === ImageGenerationModel.DALLE2) {
    result = await generateWithDalle(options);
  } else if (options.model === ImageGenerationModel.GPT4o) {
    result = await generateWithGPT4o(options);
  } else if (options.model === ImageGenerationModel.StableDiffusion) {
    result = await generateWithStableDiffusion(options);
  } else {
    result = {
      success: false,
      imageUrl: '',
      error: `Unsupported model: ${options.model}`
    };
  }
  
  // Add the full prompt to the result
  if (result.success) {
    result.fullPrompt = fullPrompt;
  }
  
  return result;
}

/**
 * Refine an existing image based on feedback
 */
export async function refineImage(
  originalPrompt: string,
  refinementPrompt: string,
  options: ImageGenerationOptions,
  annotations?: Annotation[]
): Promise<ImageGenerationResult> {
  // Get image dimensions from size
  const { width, height } = spatialProcessing.estimateImageDimensions(options.size);
  
  // Check if the refinementPrompt already contains an image analysis section
  const hasImageAnalysisInPrompt = refinementPrompt.includes("## REFERENCE IMAGE ANALYSIS");
  
  // If we don't have an image description but have an image URL, generate one using Vision API
  if (!options.imageDescription && options.imageUrl && options.apiKey && !hasImageAnalysisInPrompt) {
    console.log('No image description provided, generating one using Vision API:', options.imageUrl);
    try {
      const imageDescription = await generateImageDescription(
        originalPrompt,
        options.imageUrl,
        options.apiKey,
        options.apiEndpoint ? options.apiEndpoint.replace('/v1/images/generations', '/v1/chat/completions') : undefined
      );
      
      // Use the generated description
      options.imageDescription = imageDescription;
      console.log('Successfully generated image description using Vision API');
    } catch (error) {
      console.error('Failed to generate image description using Vision API:', error);
      // Continue with refinement even if description generation fails
    }
  }
  
  // Create a rich prompt with spatial information
  let spatialRefinementPrompt = refinementPrompt;
  
  // If we have annotations with spatial information, use the enhanced spatial processing
  if (annotations && annotations.length > 0) {
    // Skip additional spatial processing if the refinement prompt already has a detailed analysis
    if (!hasImageAnalysisInPrompt) {
      // Extract global feedback (typically the first lines before annotation details)
      const globalFeedback = refinementPrompt.split('\n\n')[0].trim();
      
      // Generate detailed spatial prompt
      spatialRefinementPrompt = spatialProcessing.generateRefinementPrompt(
        { 
          prompt: originalPrompt,
          description: options.imageDescription, 
          width,
          height 
        },
        annotations,
        globalFeedback
      );
      
      console.log('Enhanced spatial refinement prompt with Vision API data generated');
    } else {
      console.log('Using provided reference image analysis in refinement prompt');
    }
  }
  
  // For DALL-E 3, combine the original prompt with refinement
  let combinedPrompt = `Original image prompt: "${originalPrompt}"\n\nRefinement instructions: ${spatialRefinementPrompt}`;
  
  // Calculate expected image description length if present
  const descriptionLength = options.imageDescription ? options.imageDescription.length : 0;
  const combinedLength = combinedPrompt.length + descriptionLength;
  
  // Check if we need to truncate the combined prompt to fit DALL-E's limit (4000 chars)
  // We'll add a safety margin and aim for 3800 max
  if (combinedLength > 3800) {
    console.log(`Warning: Combined prompt is too long (${combinedLength} chars). Truncating...`);
    
    if (options.imageDescription && options.imageDescription.length > 1000) {
      // Truncate the image description first, as it's likely the longest part
      const maxDescriptionLength = 1000;
      options.imageDescription = options.imageDescription.substring(0, maxDescriptionLength) + 
        "... [description truncated to fit DALL-E character limit]";
      console.log(`Truncated image description to ${maxDescriptionLength} chars`);
    }
    
    // Now rebuild the combined prompt with the truncated description
    combinedPrompt = `Original image prompt: "${originalPrompt}"\n\nRefinement instructions: ${spatialRefinementPrompt}`;
    
    // If it's still too long, truncate the refinement prompt
    if (combinedPrompt.length > 3800) {
      const maxRefinementLength = 3800 - originalPrompt.length - 50; // 50 chars for template text
      spatialRefinementPrompt = spatialRefinementPrompt.substring(0, maxRefinementLength) + 
        "... [refinement truncated to fit DALL-E character limit]";
      combinedPrompt = `Original image prompt: "${originalPrompt}"\n\nRefinement instructions: ${spatialRefinementPrompt}`;
      console.log(`Truncated refinement prompt to ${maxRefinementLength} chars`);
    }
    
    console.log(`Final prompt length: ${combinedPrompt.length} chars`);
  }
  
  // Set the combined prompt as the new prompt
  options.prompt = combinedPrompt;
  
  // Generate the new image
  const result = await generateImage({
    ...options,
    prompt: combinedPrompt,
    // For GPT-4o refinements, we want to upload the previous image
    uploadPreviousImage: options.model === ImageGenerationModel.GPT4o ? true : options.uploadPreviousImage
  });
  
  // Store the full combined prompt
  if (result.success) {
    result.fullPrompt = combinedPrompt;
  }
  
  return result;
}

/**
 * Generate a placeholder image - only used as fallback for testing when APIs are unavailable
 */
export async function generatePlaceholderImage(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
  try {
    // Extract dimensions from size
    const [width, height] = options.size.split('x').map(Number);
    
    // Generate a descriptive static placeholder with the prompt text
    const placeholderUrl = `https://placehold.co/${width}x${height}/png?text=${encodeURIComponent(options.prompt.substring(0, 20))}`;
    
    // Save the image locally
    const localImageUrl = await imageStorage.saveImageFromUrl(placeholderUrl, options.sessionId);
    
    return {
      success: true,
      imageUrl: localImageUrl,
      localImagePath: localImageUrl
    };
  } catch (error) {
    console.error('Placeholder image generation failed:', error);
    return {
      success: false,
      imageUrl: '',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Generate a comprehensive image description using OpenAI's GPT-4 Vision model
 * This sends the actual image to the API to get a precise description of the content
 */
export async function generateImageDescription(
  prompt: string, 
  imageUrl?: string, 
  apiKey?: string,
  apiEndpoint?: string
): Promise<string> {
  // If we don't have an image URL, return a placeholder message
  if (!imageUrl) {
    return `No image available for analysis. Original prompt was: "${prompt}"`;
  }
  
  // If no API key is provided, return an error message
  if (!apiKey) {
    console.error("API key is required for image description generation");
    return "Error: API key required for detailed image analysis.";
  }

  try {
    const endpoint = apiEndpoint || "https://api.openai.com/v1/chat/completions";
    
    // Encode the image as a base64 string if it's a local file
    let base64Image = "";
    
    if (imageUrl.startsWith('file://')) {
      // For local files, we need to load the image and convert to base64
      try {
        // In Electron, we can use Node.js APIs via IPC
        const filePath = imageUrl.replace('file://', '');
        const response = await fetch('file://' + filePath);
        const blob = await response.blob();
        base64Image = await blobToBase64(blob);
      } catch (error) {
        console.error('Error loading local image:', error);
        return "Error loading image for analysis. Using original prompt as fallback.";
      }
    } else if (imageUrl.startsWith('data:image')) {
      // Already a data URL
      base64Image = imageUrl;
    } else {
      // Remote URL - fetch and convert to base64
      try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        base64Image = await blobToBase64(blob);
      } catch (error) {
        console.error('Error fetching remote image:', error);
        return "Error loading image for analysis. Using original prompt as fallback.";
      }
    }
    
    // Define the detailed analysis instructions - updated for brevity
    const analysisInstructions = `
You are an expert image analyst. Create a CONCISE but detailed description of this image for use as a reference by DALL-E.

IMPORTANT: Your entire description MUST be under 1500 characters as it will be combined with other text, and the total must stay under 4000 characters.

Describe the following in the most space-efficient way possible:
1. PRIMARY SUBJECTS: Main subjects with positions (using top-left, center, bottom-right, etc.)
2. SPATIAL RELATIONSHIPS: Key spatial relationships between elements
3. COMPOSITION: Essential foreground, middle-ground, background elements
4. LIGHTING & COLOR: Key lighting direction and dominant color palette
5. STYLE: Be VERY specific about the rendering style (photorealistic, cartoon, oil painting, watercolor, sketch, etc.) and any distinctive visual techniques used
6. MOOD/ATMOSPHERE: Overall feeling in 1-2 words

BE SPECIFIC about positioning and style while keeping your description brief and focused. Avoid flowery language and unnecessary details.

Original prompt: "${prompt}"
    `;
    
    // Prepare the API request body
    const requestBody = {
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: analysisInstructions },
            {
              type: "image_url",
              image_url: {
                url: base64Image
              }
            }
          ]
        }
      ],
      max_tokens: 1500
    };

    // Make the API request
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    // Parse the response
    if (!response.ok) {
      const errorData = await response.json();
      console.error('GPT-4 Vision API error:', errorData);
      throw new Error(`GPT-4 Vision API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const description = data.choices?.[0]?.message?.content;

    if (!description) {
      throw new Error('No description returned from GPT-4 Vision API');
    }

    return description;
  } catch (error) {
    console.error('Image description generation failed:', error);
    return `Failed to generate detailed image description. Using original prompt: "${prompt}"`;
  }
}

/**
 * Helper function to convert a Blob to a base64 data URL
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
} 