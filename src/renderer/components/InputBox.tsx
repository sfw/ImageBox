import React, { useRef, useState } from 'react'
import { Typography, useTheme } from '@mui/material'
import { SessionType, createMessage, ModelProvider } from '../../shared/types'
import { useTranslation } from 'react-i18next'
import * as atoms from '../stores/atoms'
import { useSetAtom, useAtomValue } from 'jotai'
import * as sessionActions from '../stores/sessionActions'
import {
    SendHorizontal,
    Settings2,
    ImageIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import icon from '../static/icon.png'
import { trackingEvent } from '@/packages/event'
import MiniButton from './MiniButton'
import _ from 'lodash'

export interface Props {
    currentSessionId: string
    currentSessionType: SessionType
}

export default function InputBox(props: Props) {
    const theme = useTheme()
    const setChatConfigDialogSession = useSetAtom(atoms.chatConfigDialogAtom)
    const { t } = useTranslation()
    const [messageInput, setMessageInput] = useState('')
    const inputRef = useRef<HTMLTextAreaElement | null>(null)
    const settings = useAtomValue(atoms.settingsAtom)

    const handleSubmit = (needGenerating = true) => {
        if (messageInput.trim() === '') {
            return
        }

        // Check if this is an image generation command
        if (messageInput.startsWith('/image ') && messageInput.length > 7) {
            const prompt = messageInput.substring(7);
            const newMessage = createMessage('user', messageInput);
            
            // Create a response message for the image
            const imageMessage = createMessage('assistant', '');
            imageMessage.imageUrl = 'placeholder'; // Will be replaced by actual URL
            imageMessage.originalPrompt = prompt;
            imageMessage.generating = true;
            imageMessage.aiProvider = ModelProvider.ImageGeneration;
            imageMessage.model = settings.imageGenerationModel;
            
            // Add the user message and image message to the session
            sessionActions.submitImageGenerationMessage({
                currentSessionId: props.currentSessionId,
                userMessage: newMessage,
                imageMessage: imageMessage,
                prompt: prompt,
                imageSize: settings.imageSize,
            });
            
            setMessageInput('');
            trackingEvent('generate_image', { event_category: 'user' });
            return;
        }

        const newMessage = createMessage('user', messageInput)
        sessionActions.submitNewUserMessage({
            currentSessionId: props.currentSessionId,
            newUserMsg: newMessage,
            needGenerating,
        })
        setMessageInput('')
        trackingEvent('send_message', { event_category: 'user' })
    }

    const minTextareaHeight = 66
    const maxTextareaHeight = 96

    const onMessageInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        const input = event.target.value
        setMessageInput(input)
    }

    const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (
            event.keyCode === 13 &&
            !event.shiftKey &&
            !event.ctrlKey &&
            !event.altKey &&
            !event.metaKey
        ) {
            event.preventDefault()
            handleSubmit()
            return
        }
        if (event.keyCode === 13 && event.ctrlKey) {
            event.preventDefault()
            handleSubmit(false)
            return
        }
    }

    const [easterEgg, setEasterEgg] = useState(false)
    
    const handleImageButton = () => {
        // Insert /image command at the start of the input
        if (!messageInput.startsWith('/image ')) {
            setMessageInput('/image ' + messageInput);
            if (inputRef.current) {
                inputRef.current.focus();
            }
        }
    };

    return (
        <div className='pl-2 pr-4'
            style={{
                borderTopWidth: '1px',
                borderTopStyle: 'solid',
                borderTopColor: theme.palette.divider,
            }}
        >
            <div className={cn('w-full mx-auto flex flex-col')}>
                <div className='flex flex-row flex-nowrap justify-between py-1'>
                    <div className='flex flex-row items-center'>
                        <MiniButton className='mr-2 hover:bg-transparent' style={{ color: theme.palette.text.primary }}
                            onClick={() => {
                                setEasterEgg(true)
                                setTimeout(() => setEasterEgg(false), 1000)
                            }}
                        >
                            <img className={cn('w-5 h-5', easterEgg ? 'animate-spin' : '')} src={icon} />
                        </MiniButton>
                        <MiniButton className='mr-2' style={{ color: theme.palette.text.primary }}
                            onClick={() => setChatConfigDialogSession(sessionActions.getCurrentSession())}
                            tooltipTitle={
                                <div className='text-center inline-block'>
                                    <span>{t('Customize settings for the current conversation')}</span>
                                </div>
                            }
                            tooltipPlacement='top'
                        >
                            <Settings2 size='22' strokeWidth={1} />
                        </MiniButton>
                        <MiniButton className='mr-2' style={{ color: theme.palette.text.primary }}
                            onClick={handleImageButton}
                            tooltipTitle={
                                <div className='text-center inline-block'>
                                    <span>{t('Generate Image')}</span>
                                </div>
                            }
                            tooltipPlacement='top'
                        >
                            <ImageIcon size='22' strokeWidth={1} />
                        </MiniButton>
                    </div>
                    <div className='flex flex-row items-center'>
                        <MiniButton className='w-8 ml-2'
                            style={{
                                color: theme.palette.getContrastText(theme.palette.primary.main),
                                backgroundColor: theme.palette.primary.main,
                            }}
                            tooltipTitle={
                                <Typography variant="caption">
                                    {t('[Enter] send, [Shift+Enter] line break, [Ctrl+Enter] send without generating')}
                                </Typography>
                            }
                            tooltipPlacement='top'
                            onClick={() => handleSubmit()}
                        >
                            <SendHorizontal size='22' strokeWidth={1} />
                        </MiniButton>
                    </div>
                </div>
                <div className='w-full pl-1 pb-2'>
                    <textarea
                        className={cn(
                            `w-full max-h-[${maxTextareaHeight}px]`,
                            'overflow-y resize-none border-none outline-none',
                            'bg-transparent p-1'
                        )}
                        value={messageInput} onChange={onMessageInput}
                        onKeyDown={onKeyDown}
                        ref={inputRef}
                        style={{
                            height: 'auto',
                            minHeight: minTextareaHeight + 'px',
                            color: theme.palette.text.primary,
                            fontFamily: theme.typography.fontFamily,
                            fontSize: theme.typography.body1.fontSize,
                        }}
                        placeholder={t('Type your question here...') || ''}
                    />
                    <div className='flex flex-row items-center'>
                    </div>
                </div>
            </div>
        </div>
    )
}
