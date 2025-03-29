import { getDefaultStore } from 'jotai'
import {
    Settings,
    createMessage,
    Message,
    Session,
    ModelProvider,
} from '../../shared/types'
import * as atoms from './atoms'
import * as promptFormat from '../packages/prompts'
import * as Sentry from '@sentry/react'
import { v4 as uuidv4 } from 'uuid'
import * as defaults from '../../shared/defaults'
import * as scrollActions from './scrollActions'
import { getModel, getModelDisplayName } from '@/packages/models'
import { AIProviderNoImplementedPaintError, NetworkError, ApiError, BaseError, ChatboxAIAPIError } from '@/packages/models/errors'
import platform from '../packages/platform'
import { throttle } from 'lodash'
import { countWord } from '@/packages/word-count'
import { estimateTokensFromMessages } from '@/packages/token'
import * as imageGeneration from '../packages/imageGeneration'
import openai from '../packages/models/openai'
import * as storage from '../storage'
import Ollama from '../packages/models/ollama'

export function create(newSession: Session) {
    const store = getDefaultStore()
    store.set(atoms.sessionsAtom, (sessions) => [...sessions, newSession])
    switchCurrentSession(newSession.id)
}

export function modify(update: Session) {
    const store = getDefaultStore()
    store.set(atoms.sessionsAtom, (sessions) =>
        sessions.map((s) => {
            if (s.id === update.id) {
                return update
            }
            return s
        })
    )
}

export function modifyName(sessionId: string, name: string) {
    const store = getDefaultStore()
    store.set(atoms.sessionsAtom, (sessions) =>
        sessions.map((s) => {
            if (s.id === sessionId) {
                return { ...s, name, threadName: name }
            }
            return s
        })
    )
}

export function createEmpty(type: 'chat') {
    switch (type) {
        case 'chat':
            return create(initEmptyChatSession())
        default:
            throw new Error(`Unknown session type: ${type}`)
    }
}

export function switchCurrentSession(sessionId: string) {
    const store = getDefaultStore()
    store.set(atoms.currentSessionIdAtom, sessionId)
    scrollActions.scrollToBottom()
}

export function remove(session: Session) {
    const store = getDefaultStore()
    store.set(atoms.sessionsAtom, (sessions) => sessions.filter((s) => s.id !== session.id))
}

export function clear(sessionId: string) {
    const session = getSession(sessionId)
    if (!session) {
        return
    }
    modify({
        ...session,
        messages: session.messages.filter((m: Message) => m.role === 'system'),
    })
}

export async function copy(source: Session) {
    const store = getDefaultStore()
    const newSession = { ...source }
    newSession.id = uuidv4()
    store.set(atoms.sessionsAtom, (sessions) => {
        let originIndex = sessions.findIndex((s) => s.id === source.id)
        if (originIndex < 0) {
            originIndex = 0
        }
        const newSessions = [...sessions]
        newSessions.splice(originIndex + 1, 0, newSession)
        return newSessions
    })
}

export function getSession(sessionId: string) {
    const store = getDefaultStore()
    const sessions = store.get(atoms.sessionsAtom) as Session[]
    return sessions.find((s: Session) => s.id === sessionId)
}

export function insertMessage(sessionId: string, msg: Message) {
    const store = getDefaultStore()
    console.log(`Inserting message ${msg.id} into session ${sessionId}`, {
        messageType: msg.role,
        imageUrl: msg.imageUrl,
        generating: msg.generating,
        aiProvider: msg.aiProvider
    });
    
    msg.wordCount = countWord(msg.content)
    msg.tokenCount = estimateTokensFromMessages([msg])
    
    // First, ensure the session exists
    ensureSessionExists(sessionId);
    
    store.set(atoms.sessionsAtom, (sessions) => {
        if (!Array.isArray(sessions)) {
            console.warn('Sessions is not an array, using defaults', sessions);
            const defaultSessions = defaults.sessions();
            const targetSession = defaultSessions.find(s => s.id === sessionId);
            if (targetSession) {
                targetSession.messages = targetSession.messages || [];
                targetSession.messages.push(msg);
            } else {
                // If session doesn't exist in defaults, create it
                const newSession = initEmptyChatSession();
                newSession.id = sessionId;
                newSession.messages.push(msg);
                defaultSessions.push(newSession);
            }
            return defaultSessions;
        }
        
        // Check if the session exists
        const session = sessions.find(s => s.id === sessionId);
        if (!session) {
            console.warn(`Session ${sessionId} not found for message insertion, creating new session`);
            // Create the session if it doesn't exist
            const newSession = initEmptyChatSession();
            newSession.id = sessionId;
            newSession.messages.push(msg);
            return [...sessions, newSession];
        }
        
        return sessions.map((s) => {
            if (s.id === sessionId) {
                const newMessages = [...(s.messages || [])]
                newMessages.push(msg)
                console.log(`Added message to session, new count: ${newMessages.length}`);
                return {
                    ...s,
                    messages: newMessages,
                }
            }
            return s
        })
    })
}

export function modifyMessage(sessionId: string, updated: Message, refreshCounting?: boolean) {
    const store = getDefaultStore()
    console.log(`Modifying message ${updated.id} in session ${sessionId}`, {
        messageType: updated.role,
        imageUrl: updated.imageUrl,
        generating: updated.generating,
        aiProvider: updated.aiProvider
    });
    
    if (refreshCounting) {
        updated.wordCount = countWord(updated.content)
        updated.tokenCount = estimateTokensFromMessages([updated])
    }

    updated.timestamp = new Date().getTime()

    // First, ensure the session exists
    ensureSessionExists(sessionId);
    
    let hasHandled = false
    const handle = (msgs: Message[]) => {
        const result = msgs.map((m) => {
            if (m.id === updated.id) {
                hasHandled = true
                return { ...updated }
            }
            return m
        })
        
        if (!hasHandled) {
            console.warn(`Message ${updated.id} not found in session messages for modification`);
            // Add the message if it doesn't exist
            result.push({...updated});
            hasHandled = true;
        }
        
        return result;
    }
    
    store.set(atoms.sessionsAtom, (sessions) => {
        if (!Array.isArray(sessions)) {
            console.warn('Sessions is not an array in modifyMessage, using defaults');
            const defaultSessions = defaults.sessions();
            const targetSession = defaultSessions.find(s => s.id === sessionId);
            if (targetSession) {
                targetSession.messages = handle(targetSession.messages || []);
            } else {
                // If session doesn't exist in defaults, create it
                const newSession = initEmptyChatSession();
                newSession.id = sessionId;
                newSession.messages.push({...updated});
                defaultSessions.push(newSession);
            }
            return defaultSessions;
        }
        
        // Check if the session exists
        const session = sessions.find(s => s.id === sessionId);
        if (!session) {
            console.warn(`Session ${sessionId} not found for message modification, creating new session`);
            // Create the session if it doesn't exist
            const newSession = initEmptyChatSession();
            newSession.id = sessionId;
            newSession.messages.push({...updated});
            return [...sessions, newSession];
        }
        
        return sessions.map((s) => {
            if (s.id !== sessionId) {
                return s
            }
            s.messages = handle(s.messages || [])
            return { ...s }
        })
    })
    
    // Debug dump the current message list after modification
    setTimeout(() => {
        const currentSession = store.get(atoms.currentSessionAtom);
        const messageList = store.get(atoms.currentMessageListAtom);
        if (currentSession && currentSession.id === sessionId) {
            console.log(`After modification: ${messageList.length} messages in current session`, {
                sessionId,
                messageListIds: messageList.map(m => m.id),
                modifiedMessagePresent: messageList.some(m => m.id === updated.id)
            });
        }
    }, 0);
}

// Helper function to ensure a session exists
function ensureSessionExists(sessionId: string) {
    const store = getDefaultStore();
    const sessions = store.get(atoms.sessionsAtom);
    
    if (!Array.isArray(sessions)) {
        console.warn('Sessions is not an array in ensureSessionExists');
        return;
    }
    
    const session = sessions.find(s => s.id === sessionId);
    if (!session) {
        console.log(`Creating missing session ${sessionId}`);
        const newSession = initEmptyChatSession();
        newSession.id = sessionId;
        store.set(atoms.sessionsAtom, (prevSessions) => {
            if (!Array.isArray(prevSessions)) {
                return [newSession];
            }
            return [...prevSessions, newSession];
        });
    }
}

export async function submitNewUserMessage(params: {
    currentSessionId: string
    newUserMsg: Message
    needGenerating: boolean
}) {
    const { currentSessionId, newUserMsg, needGenerating } = params
    insertMessage(currentSessionId, newUserMsg)
    let newAssistantMsg = createMessage('assistant', '')
    if (needGenerating) {
        newAssistantMsg.generating = true
        insertMessage(currentSessionId, newAssistantMsg)
    }
    if (needGenerating) {
        return generate(currentSessionId, newAssistantMsg)
    }
}

export async function generate(sessionId: string, targetMsg: Message) {
    const store = getDefaultStore()
    const settings = store.get(atoms.settingsAtom)
    const configs = await platform.getConfig()
    const session = getSession(sessionId)
    if (!session) {
        return
    }
    
    const placeholder = '...'
    targetMsg = {
        ...targetMsg,
        content: placeholder,
        cancel: undefined,
        aiProvider: settings.aiProvider,
        model: getModelDisplayName(settings, session.type || 'chat'),
        generating: true,
        errorCode: undefined,
        error: undefined,
        errorExtra: undefined,
    }
    modifyMessage(sessionId, targetMsg)

    let messages = session.messages
    let targetMsgIx = messages.findIndex((m: Message) => m.id === targetMsg.id)

    try {
        const model = getModel(settings, configs)
        switch (session.type) {
            case 'chat':
            case undefined:
                const promptMsgs = genMessageContext(settings, messages.slice(0, targetMsgIx))
                const throttledModifyMessage = throttle(({ text, cancel }: { text: string, cancel: () => void }) => {
                    targetMsg = { ...targetMsg, content: text, cancel }
                    modifyMessage(sessionId, targetMsg)
                }, 100)
                await model.chat(promptMsgs, throttledModifyMessage)
                targetMsg = {
                    ...targetMsg,
                    generating: false,
                    cancel: undefined,
                    tokensUsed: estimateTokensFromMessages([...promptMsgs, targetMsg]),
                }
                modifyMessage(sessionId, targetMsg, true)
                break
            default:
                throw new Error(`Unknown session type: ${session.type}, generate failed`)
        }
    } catch (err: any) {
        if (!(err instanceof Error)) {
            err = new Error(`${err}`)
        }
        if (!(err instanceof ApiError || err instanceof NetworkError || err instanceof AIProviderNoImplementedPaintError)) {
            Sentry.captureException(err) // unexpected error should be reported
        }
        let errorCode: number | undefined = undefined
        if (err instanceof BaseError) {
            errorCode = err.code
        }
        targetMsg = {
            ...targetMsg,
            generating: false,
            cancel: undefined,
            content: targetMsg.content === placeholder ? '' : targetMsg.content,
            errorCode,
            error: `${err.message}`,
            errorExtra: {
                aiProvider: settings.aiProvider,
                host: err['host'],
            },
        }
        modifyMessage(sessionId, targetMsg, true)
    }
}

async function _generateName(sessionId: string, modifyName: (sessionId: string, name: string) => void) {
    const store = getDefaultStore()
    const settings = store.get(atoms.settingsAtom)
    const session = getSession(sessionId)
    if (!session) {
        return
    }
    const configs = await platform.getConfig()
    try {
        const model = getModel(settings, configs)
        let name = await model.chat(promptFormat.nameConversation(
            session.messages
                .filter((m: Message) => m.role !== 'system')
                .slice(0, 4),
            settings.language,
        ),
        )
        name = name.replace(/['"“"']/g, '')
        name = name.slice(0, 10)
        modifyName(session.id, name)
    } catch (e: any) {
        if (!(e instanceof ApiError || e instanceof NetworkError)) {
            Sentry.captureException(e) // unexpected error should be reported
        }
    }
}

export async function generateName(sessionId: string) {
    return _generateName(sessionId, modifyName)
}

function genMessageContext(settings: Settings, msgs: Message[]) {
    const {
        openaiMaxContextMessageCount
    } = settings
    if (msgs.length === 0) {
        throw new Error('No messages to replay')
    }
    const head = msgs[0].role === 'system' ? msgs[0] : undefined
    if (head) {
        msgs = msgs.slice(1)
    }
    let totalLen = head ? estimateTokensFromMessages([head]) : 0
    let prompts: Message[] = []
    for (let i = msgs.length - 1; i >= 0; i--) {
        const msg = msgs[i]
        if (msg.error || msg.errorCode) {
            continue
        }
        const size = estimateTokensFromMessages([msg]) + 20 // 20 is a rough estimation of the overhead of the prompt
        if (settings.aiProvider === 'openai') {
        }
        if (
            openaiMaxContextMessageCount <= 20 &&
            prompts.length >= openaiMaxContextMessageCount + 1
        ) {
            break
        }
        prompts = [msg, ...prompts]
        totalLen += size
    }
    if (head) {
        prompts = [head, ...prompts]
    }
    return prompts
}

export function initEmptyChatSession(): Session {
    const store = getDefaultStore()
    const settings = store.get(atoms.settingsAtom)
    return {
        id: uuidv4(),
        name: 'Untitled',
        type: 'chat',
        messages: [
            {
                id: uuidv4(),
                role: 'system',
                content: settings.defaultPrompt || defaults.getDefaultPrompt(),
            },
        ],
    }
}

export function getSessions() {
    const store = getDefaultStore()
    return store.get(atoms.sessionsAtom)
}

export function getSortedSessions() {
    const store = getDefaultStore()
    return store.get(atoms.sortedSessionsAtom)
}

export function getCurrentSession() {
    const store = getDefaultStore()
    return store.get(atoms.currentSessionAtom)
}

export function getCurrentMessages() {
    const store = getDefaultStore()
    return store.get(atoms.currentMessageListAtom)
}

export async function submitImageGenerationMessage(params: {
    currentSessionId: string
    userMessage: Message
    imageMessage: Message
    prompt: string
    imageSize: string
}) {
    const { currentSessionId, userMessage, imageMessage, prompt, imageSize } = params;
    
    // Debug logging for image generation
    console.log('Starting image generation process', {
        sessionId: currentSessionId,
        prompt,
        imageMessageId: imageMessage.id
    });
    
    // Ensure the session exists before inserting anything
    ensureSessionExists(currentSessionId);
    
    try {
        // Insert the user message
        insertMessage(currentSessionId, userMessage);
        
        // Insert the image response message
        imageMessage.imageUrl = 'placeholder'; // Set a placeholder to ensure UI shows it
        insertMessage(currentSessionId, imageMessage);
        console.log('Image message inserted into session', imageMessage);
        
        // Force select the session
        switchCurrentSession(currentSessionId);
        
        // Get settings for the API call
        const store = getDefaultStore();
        const settings = store.get(atoms.settingsAtom);
        
        try {
            // Use the real image generation API
            console.log('Calling image generation API with:', {
                prompt,
                model: settings.imageGenerationModel,
                size: settings.imageSize
            });
            
            const result = await imageGeneration.generateImage({
                prompt: prompt,
                size: settings.imageSize,
                model: settings.imageGenerationModel,
                apiKey: settings.openaiKey,
                apiEndpoint: settings.apiHost ? `${settings.apiHost}/v1/images/generations` : undefined,
                stableDiffusionHost: settings.stableDiffusionHost,
                stableDiffusionProvider: settings.stableDiffusionProvider,
                stableDiffusionAPIKey: settings.stableDiffusionAPIKey,
                sessionId: currentSessionId,
                // Pass DALL-E 3 specific parameters if they exist
                ...(settings.imageStyle && { style: settings.imageStyle }),
                ...(settings.imageQuality && { quality: settings.imageQuality })
            });
            
            if (result.success) {
                // Update the image message with the generated image URL
                imageMessage.generating = false;
                imageMessage.imageUrl = result.imageUrl;
                console.log('Image generation successful, updating message with URL:', result.imageUrl);
                modifyMessage(currentSessionId, imageMessage);
                
                // Double-check that the modification worked by getting the current messages
                setTimeout(() => {
                    const currentSession = store.get(atoms.currentSessionAtom);
                    if (currentSession && currentSession.id === currentSessionId) {
                        const message = currentSession.messages.find(m => m.id === imageMessage.id);
                        console.log('Message verification after image generation:', {
                            found: !!message,
                            imageUrl: message?.imageUrl,
                            generating: message?.generating
                        });
                    }
                }, 100);
            } else {
                // Handle error
                imageMessage.generating = false;
                imageMessage.error = result.error;
                imageMessage.errorCode = 500;
                console.error('Image generation failed:', result.error);
                modifyMessage(currentSessionId, imageMessage);
            }
        } catch (error) {
            console.error("Error generating image:", error);
            // Update message with error
            imageMessage.generating = false;
            imageMessage.error = error instanceof Error ? error.message : "Failed to generate image";
            imageMessage.errorCode = 500;
            modifyMessage(currentSessionId, imageMessage);
        }
        
        // Return to enable chaining
        return imageMessage;
    } catch (error) {
        console.error("Fatal error in submitImageGenerationMessage:", error);
        throw error; // Re-throw for upstream handling
    }
}
