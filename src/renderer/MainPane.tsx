import { Box } from '@mui/material'
import * as atoms from './stores/atoms'
import { useAtomValue } from 'jotai'
import InputBox from './components/InputBox'
import MessageList from './components/MessageList'
import { drawerWidth } from './Sidebar'
import Header from './components/Header'
import ImageGenerationToolbar from './components/ImageGenerationToolbar'

interface Props {}

export default function MainPane(props: Props) {
    const currentSession = useAtomValue(atoms.currentSessionAtom)
    const showImageGenerationToolbar = useAtomValue(atoms.showImageGenerationToolbarAtom)

    return (
        <Box
            className="h-full w-full"
            sx={{
                flexGrow: 1,
                marginLeft: `${drawerWidth}px`,
            }}
        >
            <div className="flex flex-col h-full">
                <Header />
                {showImageGenerationToolbar && <ImageGenerationToolbar />}
                <MessageList />
                <InputBox currentSessionId={currentSession.id} currentSessionType={currentSession.type || 'chat'} />
            </div>
        </Box>
    )
}
