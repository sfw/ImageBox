import { v4 as uuidv4 } from 'uuid';
import platform from './platform';

// Define the base directory for storing images
let baseImageDir: string | null = null;

/**
 * Initialize the image storage system
 * @param customPath Optional custom path to store images
 * @returns The base directory path where images will be stored
 */
export async function initImageStorage(customPath?: string): Promise<string> {
  if (baseImageDir) {
    return baseImageDir;
  }

  try {
    // If custom path is provided, use it; otherwise use default app data location
    if (customPath) {
      baseImageDir = customPath;
    } else {
      // Get app data directory from platform
      const appDataDir = await platform.getAppDataDir();
      baseImageDir = `${appDataDir}/images`;
    }

    // Create the directory using IPC
    await platform.ipc.invoke('ensureDirectory', baseImageDir);

    return baseImageDir;
  } catch (error) {
    console.error('Failed to initialize image storage:', error);
    throw error;
  }
}

/**
 * Create a directory for a specific session
 * @param sessionId The session ID
 * @returns Path to the session directory
 */
export async function getSessionDirectory(sessionId: string): Promise<string> {
  // Ensure storage is initialized
  await initImageStorage();
  
  if (!baseImageDir) {
    throw new Error('Image storage not initialized');
  }

  // Create a directory for the session
  const sessionDir = `${baseImageDir}/${sessionId}`;
  await platform.ipc.invoke('ensureDirectory', sessionDir);

  return sessionDir;
}

/**
 * Save an image from a base64 data URL
 * @param dataUrl The base64 data URL of the image
 * @param sessionId The session ID
 * @returns The local file path to the saved image
 */
export async function saveImageFromDataUrl(dataUrl: string, sessionId: string): Promise<string> {
  try {
    // Get directory for this session
    const sessionDir = await getSessionDirectory(sessionId);
    
    // Generate a unique filename
    const filename = `${Date.now()}-${uuidv4().substring(0, 8)}.png`;
    const filePath = `${sessionDir}/${filename}`;
    
    // Convert data URL to base64 string
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    
    // Save the file using IPC
    await platform.ipc.invoke('saveBase64Image', filePath, base64Data);
    
    // Return the file URL (not the file path)
    return getFileUrl(filePath);
  } catch (error) {
    console.error('Failed to save image:', error);
    throw error;
  }
}

/**
 * Save an image from a URL (downloading it first)
 * @param url The image URL
 * @param sessionId The session ID
 * @returns The local file path to the saved image
 */
export async function saveImageFromUrl(url: string, sessionId: string): Promise<string> {
  try {
    // Get directory for this session
    const sessionDir = await getSessionDirectory(sessionId);
    
    // Generate a unique filename
    const filename = `${Date.now()}-${uuidv4().substring(0, 8)}.png`;
    const filePath = `${sessionDir}/${filename}`;
    
    // Download and save the image using IPC
    await platform.ipc.invoke('downloadImage', url, filePath);
    
    // Return the file URL (not the file path)
    return getFileUrl(filePath);
  } catch (error) {
    console.error('Failed to save image from URL:', error);
    
    // For development mode, we'll provide a placeholder
    return `https://picsum.photos/1024/1024?random=${Math.floor(Math.random() * 1000)}`;
  }
}

/**
 * Delete an image file
 * @param filePath The path to the image file
 */
export async function deleteImage(filePath: string): Promise<void> {
  try {
    // If file path is a URL, convert it back to a local path
    const localPath = filePath.startsWith('file://') ? filePath.substring(7) : filePath;
    await platform.ipc.invoke('deleteFile', localPath);
  } catch (error) {
    console.error('Failed to delete image:', error);
    throw error;
  }
}

/**
 * Get file protocol URL for local image
 * @param filePath The local file path or URL
 * @returns A file:// URL or the original URL
 */
export function getFileUrl(filePath: string): string {
  // If it's already a URL, return it as is
  if (filePath.startsWith('http://') || filePath.startsWith('https://') || filePath.startsWith('file://')) {
    return filePath;
  }
  
  try {
    // Create a file URL that works in Electron
    // Make sure the path is properly encoded
    const normalizedPath = filePath.replace(/\\/g, '/');
    
    // On macOS, we need to ensure the path starts with a slash
    const pathWithPrefix = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
    
    // Manually construct a valid file URL with proper encoding
    let encodedPath = '';
    pathWithPrefix.split('/').forEach((segment, index) => {
      if (index === 0 && segment === '') {
        // First empty segment representing root - keep as is
        encodedPath += '/';
      } else {
        // Encode each path segment individually
        encodedPath += encodeURIComponent(segment) + (index < pathWithPrefix.split('/').length - 1 ? '/' : '');
      }
    });
    
    return `file://${encodedPath}`;
  } catch (error) {
    console.error('Error creating file URL:', error);
    
    // Fallback to a simple approach if the above fails
    const normalizedPath = filePath.replace(/\\/g, '/');
    return `file:///${normalizedPath}`;
  }
}

/**
 * List all images for a session
 * @param sessionId The session ID
 * @returns Array of file URLs for all images in the session
 */
export async function listSessionImages(sessionId: string): Promise<string[]> {
  try {
    const sessionDir = await getSessionDirectory(sessionId);
    
    // List files in the directory using IPC
    const files = await platform.ipc.invoke('listFiles', sessionDir, '*.{jpg,jpeg,png,gif}');
    
    // Convert all paths to file URLs
    return files.map((file: string) => getFileUrl(file));
  } catch (error) {
    console.error('Failed to list session images:', error);
    return [];
  }
} 