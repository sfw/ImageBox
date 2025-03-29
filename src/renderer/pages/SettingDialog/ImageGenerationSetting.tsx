import { FormControl, FormHelperText, InputLabel, MenuItem, Select, Typography, Box, TextField, Collapse } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { ImageGenerationModel, ImageSize, ModelSettings, StableDiffusionProvider } from '../../../shared/types'
import PasswordTextField from '../../components/PasswordTextField'

interface ImageGenerationSettingProps {
    settingsEdit: ModelSettings
    setSettingsEdit: (settings: ModelSettings) => void
}

export default function ImageGenerationSetting({ settingsEdit, setSettingsEdit }: ImageGenerationSettingProps) {
    const { t } = useTranslation()

    const handleModelChange = (model: ImageGenerationModel) => {
        setSettingsEdit({ ...settingsEdit, imageGenerationModel: model })
    }

    const handleSizeChange = (size: ImageSize) => {
        setSettingsEdit({ ...settingsEdit, imageSize: size })
    }

    const handleStyleChange = (style: 'vivid' | 'natural') => {
        setSettingsEdit({ ...settingsEdit, imageStyle: style })
    }

    const handleQualityChange = (quality: 'standard' | 'hd') => {
        setSettingsEdit({ ...settingsEdit, imageQuality: quality })
    }

    const handleSDProviderChange = (provider: StableDiffusionProvider) => {
        setSettingsEdit({ ...settingsEdit, stableDiffusionProvider: provider })
    }

    const handleSDHostChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        let value = event.target.value.trim();
        // Add protocol if missing
        if (value && value.length > 0 && !value.startsWith('http')) {
            value = 'http://' + value;
        }
        setSettingsEdit({ ...settingsEdit, stableDiffusionHost: value })
    }

    const handleSDAPIKeyChange = (value: string) => {
        setSettingsEdit({ ...settingsEdit, stableDiffusionAPIKey: value })
    }

    // Check if DALL-E 3 is selected
    const isDallE3Selected = settingsEdit.imageGenerationModel === ImageGenerationModel.DALLE3;
    const isStableDiffusionSelected = settingsEdit.imageGenerationModel === ImageGenerationModel.StableDiffusion;
    const sdProvider = settingsEdit.stableDiffusionProvider || StableDiffusionProvider.Local;
    const isLocalSD = sdProvider === StableDiffusionProvider.Local;
    const needsAPIKey = sdProvider === StableDiffusionProvider.StableDiffusionAPI || 
                       sdProvider === StableDiffusionProvider.Replicate;
    const isCustomSD = sdProvider === StableDiffusionProvider.Custom;

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Typography variant="h6">{t('Image Generation Settings')}</Typography>
            
            <FormControl fullWidth variant="outlined">
                <InputLabel id="image-model-label">{t('Image Generation Model')}</InputLabel>
                <Select
                    labelId="image-model-label"
                    value={settingsEdit.imageGenerationModel || ImageGenerationModel.DALLE3}
                    onChange={(e) => handleModelChange(e.target.value as ImageGenerationModel)}
                    label={t('Image Generation Model')}
                >
                    <MenuItem value={ImageGenerationModel.DALLE3}>DALL-E 3</MenuItem>
                    <MenuItem value={ImageGenerationModel.DALLE2}>DALL-E 2</MenuItem>
                    <MenuItem value={ImageGenerationModel.StableDiffusion}>Stable Diffusion</MenuItem>
                </Select>
                <FormHelperText>{t('Select the model to use for image generation')}</FormHelperText>
            </FormControl>

            <FormControl fullWidth variant="outlined">
                <InputLabel id="image-size-label">{t('Image Size')}</InputLabel>
                <Select
                    labelId="image-size-label"
                    value={settingsEdit.imageSize || '1024x1024'}
                    onChange={(e) => handleSizeChange(e.target.value as ImageSize)}
                    label={t('Image Size')}
                >
                    <MenuItem value="1024x1024">1024 x 1024 (Square)</MenuItem>
                    <MenuItem value="1024x1792">1024 x 1792 (Portrait)</MenuItem>
                    <MenuItem value="1792x1024">1792 x 1024 (Landscape)</MenuItem>
                    <MenuItem value="512x512">512 x 512 (Small)</MenuItem>
                </Select>
                <FormHelperText>{t('Select the default size for generated images')}</FormHelperText>
            </FormControl>

            {/* DALL-E 3 specific settings */}
            {isDallE3Selected && (
                <>
                    <FormControl fullWidth variant="outlined">
                        <InputLabel id="image-style-label">{t('Image Style')}</InputLabel>
                        <Select
                            labelId="image-style-label"
                            value={settingsEdit.imageStyle || 'vivid'}
                            onChange={(e) => handleStyleChange(e.target.value as 'vivid' | 'natural')}
                            label={t('Image Style')}
                        >
                            <MenuItem value="vivid">Vivid (Hyper-real, Dramatic)</MenuItem>
                            <MenuItem value="natural">Natural (More subdued, Realistic)</MenuItem>
                        </Select>
                        <FormHelperText>{t('DALL-E 3 only: Choose between vivid (more dramatic) or natural style')}</FormHelperText>
                    </FormControl>

                    <FormControl fullWidth variant="outlined">
                        <InputLabel id="image-quality-label">{t('Image Quality')}</InputLabel>
                        <Select
                            labelId="image-quality-label"
                            value={settingsEdit.imageQuality || 'standard'}
                            onChange={(e) => handleQualityChange(e.target.value as 'standard' | 'hd')}
                            label={t('Image Quality')}
                        >
                            <MenuItem value="standard">Standard</MenuItem>
                            <MenuItem value="hd">HD (Higher detail, costs more)</MenuItem>
                        </Select>
                        <FormHelperText>{t('DALL-E 3 only: HD creates images with finer details but costs more credits')}</FormHelperText>
                    </FormControl>
                </>
            )}

            {/* Stable Diffusion specific settings */}
            {isStableDiffusionSelected && (
                <>
                    <FormControl fullWidth variant="outlined">
                        <InputLabel id="sd-provider-label">{t('Stable Diffusion Provider')}</InputLabel>
                        <Select
                            labelId="sd-provider-label"
                            value={sdProvider}
                            onChange={(e) => handleSDProviderChange(e.target.value as StableDiffusionProvider)}
                            label={t('Stable Diffusion Provider')}
                        >
                            <MenuItem value={StableDiffusionProvider.Local}>Local API (AUTOMATIC1111 WebUI)</MenuItem>
                            <MenuItem value={StableDiffusionProvider.StableDiffusionAPI}>StableDiffusionAPI.com</MenuItem>
                            <MenuItem value={StableDiffusionProvider.Replicate}>Replicate.com</MenuItem>
                            <MenuItem value={StableDiffusionProvider.Custom}>Custom API</MenuItem>
                        </Select>
                        <FormHelperText>{t('Select which Stable Diffusion service to use')}</FormHelperText>
                    </FormControl>

                    {/* Local SD settings */}
                    <Collapse in={isLocalSD}>
                        <FormControl fullWidth variant="outlined">
                            <TextField
                                margin="dense"
                                label={t('Local API URL')}
                                type="text"
                                fullWidth
                                variant="outlined"
                                value={settingsEdit.stableDiffusionHost || 'http://localhost:7860'}
                                onChange={handleSDHostChange}
                                placeholder="http://localhost:7860"
                                helperText={t('URL for your local Stable Diffusion API (AUTOMATIC1111 WebUI)')}
                            />
                        </FormControl>
                    </Collapse>

                    {/* StableDiffusionAPI.com or Replicate settings */}
                    <Collapse in={needsAPIKey}>
                        <PasswordTextField
                            label={t('API Key')}
                            value={settingsEdit.stableDiffusionAPIKey || ''}
                            setValue={handleSDAPIKeyChange}
                            placeholder={
                                sdProvider === StableDiffusionProvider.StableDiffusionAPI 
                                ? "Your StableDiffusionAPI.com API key" 
                                : "Your Replicate.com API key"
                            }
                        />
                    </Collapse>

                    {/* Custom SD settings */}
                    <Collapse in={isCustomSD}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                            <FormControl fullWidth variant="outlined">
                                <TextField
                                    margin="dense"
                                    label={t('Custom API URL')}
                                    type="text"
                                    fullWidth
                                    variant="outlined"
                                    value={settingsEdit.stableDiffusionHost || ''}
                                    onChange={handleSDHostChange}
                                    placeholder="https://your-custom-api.com/endpoint"
                                    helperText={t('Full URL for your custom Stable Diffusion API endpoint')}
                                />
                            </FormControl>
                            
                            <PasswordTextField
                                label={t('API Key (if required)')}
                                value={settingsEdit.stableDiffusionAPIKey || ''}
                                setValue={handleSDAPIKeyChange}
                                placeholder="Optional API key for your custom endpoint"
                            />
                        </Box>
                    </Collapse>
                </>
            )}
        </Box>
    )
} 