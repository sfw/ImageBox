import { atom, SetStateAction } from 'jotai'
import { Session, Toast, Settings, CopilotDetail, Message, SettingWindowTab } from '../../shared/types'
import { selectAtom, atomWithStorage } from 'jotai/utils'
import { focusAtom } from 'jotai-optics'
import * as defaults from '../../shared/defaults'
import storage, { StorageKey } from '../storage'
import platform from '../packages/platform'
import { v4 as uuidv4 } from 'uuid'

const _settingsAtom = atomWithStorage<Settings>(StorageKey.Settings, defaults.settings(), storage)
export const settingsAtom = atom<Settings, [SetStateAction<Settings>], void>(
    (get) => {
        const settings = get(_settingsAtom)
        return Object.assign({}, defaults.settings(), settings) as Settings
    },
    (get, set, update: SetStateAction<Settings>) => {
        const settings = get(_settingsAtom) as Settings
        const newSettings = typeof update === 'function' 
            ? update(settings) as Settings 
            : update as Settings
            
        if (newSettings && typeof newSettings === 'object' && 
            'proxy' in newSettings && 
            settings && typeof settings === 'object' && 
            'proxy' in settings &&
            newSettings.proxy !== settings.proxy) {
            // Use try-catch to avoid errors if method doesn't exist
            try {
                // @ts-ignore
                if (typeof platform.restartMainProcess === 'function') {
                    // @ts-ignore
                    platform.restartMainProcess();
                }
            } catch (error) {
                console.error("Failed to restart main process:", error);
            }
        }
        set(_settingsAtom, newSettings)
    }
)

export const languageAtom = focusAtom(settingsAtom, (optic) => optic.prop('language'))
export const showWordCountAtom = focusAtom(settingsAtom, (optic) => optic.prop('showWordCount'))
export const showTokenCountAtom = focusAtom(settingsAtom, (optic) => optic.prop('showTokenCount'))
export const showTokenUsedAtom = focusAtom(settingsAtom, (optic) => optic.prop('showTokenUsed'))
export const showModelNameAtom = focusAtom(settingsAtom, (optic) => optic.prop('showModelName'))
export const showMessageTimestampAtom = focusAtom(settingsAtom, (optic) => optic.prop('showMessageTimestamp'))
export const themeAtom = focusAtom(settingsAtom, (optic) => optic.prop('theme'))
export const fontSizeAtom = focusAtom(settingsAtom, (optic) => optic.prop('fontSize'))
export const spellCheckAtom = focusAtom(settingsAtom, (optic) => optic.prop('spellCheck'))
export const allowReportingAndTrackingAtom = focusAtom(settingsAtom, (optic) => optic.prop('allowReportingAndTracking'))
export const enableMarkdownRenderingAtom = focusAtom(settingsAtom, (optic) => optic.prop('enableMarkdownRendering'))
export const autoGenerateTitleAtom = focusAtom(settingsAtom, (optic) => optic.prop('autoGenerateTitle'))

export const licenseDetailAtom = focusAtom(settingsAtom, (optic) => optic.prop('licenseDetail'))

// myCopilots
export const myCopilotsAtom = atomWithStorage<CopilotDetail[]>(StorageKey.MyCopilots, [], storage)

// sessions
const _sessionsAtom = atomWithStorage<Session[]>(StorageKey.ChatSessions, [], storage)
export const sessionsAtom = atom(
    (get) => {
        let sessions = get(_sessionsAtom) as Session[]
        
        // Check if sessions is a Promise-like object
        if (sessions && typeof sessions === 'object' && 'then' in sessions) {
            console.warn('Sessions is a Promise, using defaults');
            return defaults.sessions();
        }
        
        if (!Array.isArray(sessions) || sessions.length === 0) {
            sessions = defaults.sessions()
        }
        return sessions
    },
    (get, set, update: SetStateAction<Session[]>) => {
        const sessions = get(_sessionsAtom) as Session[]
        
        // Check if sessions is a Promise-like object
        if (sessions && typeof sessions === 'object' && 'then' in sessions) {
            console.warn('Sessions is a Promise in setter, using empty array');
            const newSessions = typeof update === 'function' ? update([]) : update;
            if (!Array.isArray(newSessions) || newSessions.length === 0) {
                set(_sessionsAtom, defaults.sessions());
            } else {
                set(_sessionsAtom, newSessions);
            }
            return;
        }
        
        let newSessions = typeof update === 'function' ? update(sessions) : update
        if (!Array.isArray(newSessions) || newSessions.length === 0) {
            newSessions = defaults.sessions()
        }
        set(_sessionsAtom, newSessions)
    }
)

export const sortedSessionsAtom = atom((get) => {
    try {
        const sessions = get(sessionsAtom);
        return sortSessions(Array.isArray(sessions) ? sessions : defaults.sessions());
    } catch (error) {
        console.error("Error in sortedSessionsAtom:", error);
        return defaults.sessions();
    }
})

export function sortSessions(sessions: Session[]): Session[] {
    try {
        return [...sessions].reverse();
    } catch (error) {
        console.error("Error in sortSessions:", error);
        return defaults.sessions();
    }
}

const _currentSessionIdCachedAtom = atomWithStorage<string | null>('_currentSessionIdCachedAtom', null)
export const currentSessionIdAtom = atom(
    (get) => {
        try {
            const idCached = get(_currentSessionIdCachedAtom)
            const sessions = get(sortedSessionsAtom)
            if (idCached && sessions.some((session) => session.id === idCached)) {
                return idCached
            }
            return sessions[0]?.id || defaults.sessions()[0].id;
        } catch (error) {
            console.error("Error in currentSessionIdAtom:", error);
            return defaults.sessions()[0].id;
        }
    },
    (_get, set, update: string) => {
        set(_currentSessionIdCachedAtom, update)
    }
)

export const currentSessionAtom = atom((get) => {
    try {
        const id = get(currentSessionIdAtom)
        const sessions = get(sessionsAtom) as Session[]
        
        let current = Array.isArray(sessions) 
            ? sessions.find((session: Session) => session.id === id) 
            : null;
            
        if (!current) {
            return (Array.isArray(sessions) && sessions.length > 0) 
                ? sessions[0] 
                : defaults.sessions()[0];
        }
        return current
    } catch (error) {
        console.error("Error in currentSessionAtom:", error);
        return defaults.sessions()[0];
    }
})

export const currentSessionNameAtom = selectAtom(currentSessionAtom, (s) => s.name)
export const currsentSessionPicUrlAtom = selectAtom(currentSessionAtom, (s) => s.picUrl)


export const currentMessageListAtom = selectAtom(currentSessionAtom, (s) => {
    let messageContext: Message[] = []
    if (s.messages) {
        messageContext = messageContext.concat(s.messages)
    }
    return messageContext
})

// toasts

export const toastsAtom = atom<Toast[]>([])

// theme

export const activeThemeAtom = atom<'light' | 'dark'>('light')

export const configVersionAtom = atomWithStorage<number>(StorageKey.ConfigVersion, 0, storage)

export const messageListRefAtom = atom<null | React.MutableRefObject<HTMLDivElement | null>>(null)

export const openSettingDialogAtom = atom<SettingWindowTab | null>(null)
export const sessionCleanDialogAtom = atom<Session | null>(null)
export const chatConfigDialogAtom = atom<Session | null>(null)

// Image generation toolbar visibility
export const showImageGenerationToolbarAtom = atom<boolean>(false)
