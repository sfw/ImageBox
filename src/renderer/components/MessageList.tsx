import { useEffect, useRef } from 'react'
import Message from './Message'
import { Typography } from '@mui/material'
import { Session, MessageRole, Annotation, Message as MessageType, ImageGenerationModel } from '../../shared/types'
import { useAtom, useAtomValue } from 'jotai'
import * as atoms from '../stores/atoms'
import * as sessionActions from '../stores/sessionActions'
import { v4 as uuidv4 } from 'uuid'
import { cn } from '@/lib/utils'
import * as imageGeneration from '../packages/imageGeneration'

interface Props { }

export default function MessageList(props: Props) {
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const currentSession = useAtomValue(atoms.currentSessionAtom)
    const messageList = useAtomValue(atoms.currentMessageListAtom)
    const settings = useAtomValue(atoms.settingsAtom)
    const ref = useRef<HTMLDivElement | null>(null)
    const [, setMessageListRef] = useAtom(atoms.messageListRefAtom)

    if (!currentSession) {
        return <Typography>No session selected.</Typography>
    }

    // Add debug logging to see all messages in current session
    useEffect(() => {
        if (messageList.length > 0) {
            console.log(`MessageList: Rendering ${messageList.length} messages`, {
                currentSessionId: currentSession.id,
                messages: messageList.map(msg => ({
                    id: msg.id,
                    role: msg.role,
                    content: msg.content?.substring(0, 50),
                    imageUrl: msg.imageUrl,
                    generating: msg.generating
                }))
            });
            
            // Check specifically for image messages
            const imageMessages = messageList.filter(msg => msg.imageUrl || msg.generating && msg.aiProvider === 'image-generation');
            if (imageMessages.length > 0) {
                console.log('Image messages in current session:', imageMessages);
            }
        }
    }, [messageList, currentSession.id]);

    useEffect(() => {
        setMessageListRef(ref)
    }, [ref])

    const handleRerollImage = async (message: MessageType) => {
        // Determine if we're rerolling a refined image or an original image
        const isRefinedImage = !!message.refinementPrompt;
        const promptToUse = isRefinedImage ? 
            `${message.originalPrompt} (with refinements)` : 
            message.originalPrompt;
            
        // Ensure we have a prompt to reroll
        if (!promptToUse) {
            console.error("Cannot reroll image without a prompt");
            return;
        }
        
        // Create a text message for the reroll action to be shown in chat
        const rerollTextMessage = {
            id: uuidv4(),
            role: 'user' as MessageRole,
            content: `🎲 Rerolling image with${isRefinedImage ? ' refined' : ''} prompt: "${promptToUse}"`,
            timestamp: Date.now(),
        };
        
        // Add the reroll text message to the chat
        sessionActions.insertMessage(currentSession.id, rerollTextMessage);
        
        // Create a new image message for the rerolled version
        const rerolledImageMessage = {
            ...message,
            id: uuidv4(),
            generating: true,
            imageUrl: undefined as unknown as string, // Type workaround - will be replaced by API result
            isReroll: true,
        };
        
        // Update the history to include the previous version if available
        if (message.history) {
            // Filter out any invalid URLs and add the current URL if valid
            if (message.imageUrl) {
                rerolledImageMessage.history = [...message.history.filter(url => url && url.trim() !== ''), message.imageUrl];
            } else {
                rerolledImageMessage.history = [...message.history.filter(url => url && url.trim() !== '')];
            }
        } else if (message.imageUrl) {
            // Create a new history array with only the current URL if valid
            rerolledImageMessage.history = [message.imageUrl];
        }
        
        // Add the rerolled image message to the session
        sessionActions.insertMessage(currentSession.id, rerolledImageMessage);
        
        try {
            // Get image dimensions from the settings
            const dimensions = settings.imageSize ? 
                settings.imageSize.split('x').map(Number) : [1024, 1024];
            const width = dimensions[0];
            const height = dimensions[1];
            
            let result;
            
            // If this is a refined image, reroll using the same refinement process
            if (isRefinedImage && message.refinementPrompt) {
                console.log("Rerolling refined image with existing refinements");
                
                // Create a detailed refinement prompt that includes the image analysis
                // This will preserve the image style and composition details
                let enhancedRefinementPrompt = message.refinementPrompt;

                // If we have a detailed image description, include it in the refinement prompt
                // This ensures style consistency across rerolls
                if (message.imageDescription) {
                    enhancedRefinementPrompt = `## REFERENCE IMAGE ANALYSIS\n${message.imageDescription}\n\n${message.refinementPrompt}`;
                    console.log("Enhanced refinement prompt with image description for style consistency");
                }
                
                result = await imageGeneration.refineImage(
                    message.originalPrompt || "An image",
                    enhancedRefinementPrompt,
                    {
                        prompt: message.originalPrompt || "An image",
                        size: settings.imageSize,
                        model: settings.imageGenerationModel,
                        apiKey: settings.openaiKey,
                        apiEndpoint: settings.apiHost ? `${settings.apiHost}/v1/images/generations` : undefined,
                        stableDiffusionHost: settings.stableDiffusionHost,
                        stableDiffusionProvider: settings.stableDiffusionProvider,
                        stableDiffusionAPIKey: settings.stableDiffusionAPIKey,
                        imageDescription: message.imageDescription, // Preserve the image description
                        sessionId: currentSession.id,
                        imageUrl: message.imageUrl, // Pass the URL of the image being refined
                        // Pass DALL-E 3 specific parameters if they exist
                        ...(settings.imageStyle && { style: settings.imageStyle }),
                        ...(settings.imageQuality && { quality: settings.imageQuality })
                    },
                    message.annotations
                );
            } else {
                // For original images, use the standard generation process
                console.log("Rerolling original image");
                result = await imageGeneration.generateImage({
                    prompt: message.originalPrompt || "An image",
                    size: settings.imageSize,
                    model: settings.imageGenerationModel,
                    apiKey: settings.openaiKey,
                    apiEndpoint: settings.apiHost ? `${settings.apiHost}/v1/images/generations` : undefined,
                    stableDiffusionHost: settings.stableDiffusionHost,
                    stableDiffusionProvider: settings.stableDiffusionProvider,
                    stableDiffusionAPIKey: settings.stableDiffusionAPIKey,
                    sessionId: currentSession.id,
                    // Pass DALL-E 3 specific parameters if they exist
                    ...(settings.imageStyle && { style: settings.imageStyle }),
                    ...(settings.imageQuality && { quality: settings.imageQuality })
                });
            }
            
            if (result.success) {
                // Update the image message with the generated image URL
                rerolledImageMessage.generating = false;
                rerolledImageMessage.imageUrl = result.imageUrl;
                rerolledImageMessage.fullPrompt = result.fullPrompt;
                // Preserve the imageDescription from the original message for future rerolls
                if (!rerolledImageMessage.imageDescription && message.imageDescription) {
                    rerolledImageMessage.imageDescription = message.imageDescription;
                }
                sessionActions.modifyMessage(currentSession.id, rerolledImageMessage);
            } else {
                // Handle error
                rerolledImageMessage.generating = false;
                rerolledImageMessage.error = result.error;
                rerolledImageMessage.errorCode = 500;
                sessionActions.modifyMessage(currentSession.id, rerolledImageMessage);
            }
        } catch (error) {
            console.error("Error in handleRerollImage:", error);
            // Show error message to user
            const errorMessage = {
                id: uuidv4(),
                role: 'system' as MessageRole,
                content: `Error rerolling image: ${error instanceof Error ? error.message : 'Unknown error'}`,
                timestamp: Date.now(),
                error: error instanceof Error ? error.message : 'Unknown error',
                errorCode: 500
            };
            sessionActions.insertMessage(currentSession.id, errorMessage);
        }
    };

    const handleRefineImage = async (message: MessageType, annotations: Annotation[], globalFeedback: string, refinementPrompt: string) => {
        try {
            // Get a loading message into the UI immediately
            const loadingTextMessage = {
                id: uuidv4(),
                role: 'user' as MessageRole,
                content: `🔍 Analyzing image for refinement...`,
                timestamp: Date.now(),
            };
            sessionActions.insertMessage(currentSession.id, loadingTextMessage);
            
            // Generate a detailed image description using GPT-4 Vision API
            let imageDescription: string;
            if (message.imageUrl) {
                console.log("Generating image description using Vision API for:", message.imageUrl);
                imageDescription = await imageGeneration.generateImageDescription(
                    message.originalPrompt || '', 
                    message.imageUrl,
                    settings.openaiKey,
                    settings.apiHost ? `${settings.apiHost}/v1/chat/completions` : undefined
                );
            } else {
                imageDescription = message.imageDescription || 
                    `No image available for analysis. Original prompt was: "${message.originalPrompt}"`;
            }
            
            // Create a text message for the image description to be shown in chat
            const descriptionTextMessage = {
                id: uuidv4(),
                role: 'user' as MessageRole,
                content: `📊 Generated Detailed Image Analysis\n\nA comprehensive analysis of "${message.originalPrompt}" has been performed using advanced vision technology, including:\n• Precise subject identification with exact positioning\n• Detailed spatial relationships and environmental context\n• Complete compositional, lighting, and color analysis\n• Texture mapping and atmospheric qualities\n\nThis detailed analysis enables highly accurate refinements while preserving the image's key characteristics.`,
                timestamp: Date.now(),
            };
            
            // Replace the loading message with the actual description message
            sessionActions.modifyMessage(currentSession.id, {
                ...loadingTextMessage,
                id: descriptionTextMessage.id,
                content: descriptionTextMessage.content
            });
            
            // Create a text message for the refinement prompt to be shown in chat
            const refinementTextMessage = {
                id: uuidv4(),
                role: 'user' as MessageRole,
                content: `🔄 Refining image with prompt:\n${refinementPrompt}`,
                timestamp: Date.now(),
            };
            
            // Add the refinement text message to the chat
            sessionActions.insertMessage(currentSession.id, refinementTextMessage);
            
            // Get image dimensions from the settings
            const dimensions = settings.imageSize ? 
                settings.imageSize.split('x').map(Number) : [1024, 1024];
            const width = dimensions[0];
            const height = dimensions[1];
            
            // Create refined image message with fresh empty annotations
            const refinedImageMessage: MessageType = {
                id: uuidv4(),
                role: 'assistant' as MessageRole,
                content: '',
                timestamp: Date.now(),
                generating: true,
                imageUrl: '',
                refinementPrompt: refinementPrompt,
                originalPrompt: message.originalPrompt, // Preserve the original prompt
                imageDescription: imageDescription, // Add the detailed image description from Vision API
                fullPrompt: '', // Will be populated after generation
                annotations: [], // Start with fresh empty annotations for the new refinement
                // Properly filter out any undefined values to ensure it's a string[] type
                history: [...(message.history || []), message.imageUrl].filter((url): url is string => 
                    typeof url === 'string' && url.trim() !== '')
            };
            
            // Add the refined image message to the session
            sessionActions.insertMessage(currentSession.id, refinedImageMessage);
            
            try {
                // Use the real image generation API
                const result = await imageGeneration.refineImage(
                    message.originalPrompt || "An image",
                    refinementPrompt,
                    {
                        prompt: message.originalPrompt || "An image",
                        size: settings.imageSize,
                        model: settings.imageGenerationModel,
                        apiKey: settings.openaiKey,
                        apiEndpoint: settings.apiHost ? `${settings.apiHost}/v1/images/generations` : undefined,
                        stableDiffusionHost: settings.stableDiffusionHost,
                        stableDiffusionProvider: settings.stableDiffusionProvider,
                        stableDiffusionAPIKey: settings.stableDiffusionAPIKey,
                        sessionId: currentSession.id,
                        imageDescription: imageDescription, // Pass the image description
                        imageUrl: message.imageUrl, // Pass the URL of the image being refined
                        // Pass DALL-E 3 specific parameters if they exist
                        ...(settings.imageStyle && { style: settings.imageStyle }),
                        ...(settings.imageQuality && { quality: settings.imageQuality })
                    },
                    annotations // Pass annotations for spatial processing
                );
                
                if (result.success) {
                    // Update the image message with the generated image URL
                    refinedImageMessage.generating = false;
                    refinedImageMessage.imageUrl = result.imageUrl;
                    refinedImageMessage.fullPrompt = result.fullPrompt;
                    sessionActions.modifyMessage(currentSession.id, refinedImageMessage);
                } else {
                    // Handle error
                    refinedImageMessage.generating = false;
                    refinedImageMessage.error = result.error;
                    refinedImageMessage.errorCode = 500;
                    sessionActions.modifyMessage(currentSession.id, refinedImageMessage);
                }
            } catch (error) {
                console.error("Error in handleRefineImage:", error);
                // Show error message to user
                const errorMessage = {
                    id: uuidv4(),
                    role: 'system' as MessageRole,
                    content: `Error refining image: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    timestamp: Date.now(),
                    error: error instanceof Error ? error.message : 'Unknown error',
                    errorCode: 500
                };
                sessionActions.insertMessage(currentSession.id, errorMessage);
            }
        } catch (error) {
            console.error("Error in handleRefineImage:", error);
            // Show error message to user
            const errorMessage = {
                id: uuidv4(),
                role: 'system' as MessageRole,
                content: `Error refining image: ${error instanceof Error ? error.message : 'Unknown error'}`,
                timestamp: Date.now(),
                error: error instanceof Error ? error.message : 'Unknown error',
                errorCode: 500
            };
            sessionActions.insertMessage(currentSession.id, errorMessage);
        }
    };

    return (
        <div className='pt-2 pb-4 flex flex-col height-full overflow-y-auto' ref={ref}>
            {messageList.map((msg, index) => (
                <Message
                    key={msg.id}
                    msg={msg}
                    sessionId={currentSession.id}
                    sessionType={currentSession.type || 'chat'}
                    collapseThreshold={msg.role === 'system' ? 150 : undefined}
                    onRefineImage={handleRefineImage}
                    onRerollImage={handleRerollImage}
                />
            ))}
            <div ref={messagesEndRef} />
        </div>
    )
}
