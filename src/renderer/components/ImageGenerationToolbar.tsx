import React, { useState } from 'react';
import { 
  Box, 
  FormControl, 
  Select, 
  MenuItem, 
  useTheme, 
  SelectChangeEvent, 
  TextField,
  InputAdornment,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  InputLabel,
  FormControlLabel,
  Checkbox,
  Typography
} from '@mui/material';
import { useAtom } from 'jotai';
import * as atoms from '../stores/atoms';
import { ImageGenerationModel, ImageSize, StableDiffusionProvider } from '../../shared/types';
import { Visibility, VisibilityOff, Settings } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

export default function ImageGenerationToolbar() {
  const theme = useTheme();
  const [settings, setSettings] = useAtom(atoms.settingsAtom);
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);
  const [showAdvancedDialog, setShowAdvancedDialog] = useState(false);

  const handleModelChange = (event: SelectChangeEvent<string>) => {
    setSettings({
      ...settings,
      imageGenerationModel: event.target.value as ImageGenerationModel
    });
  };

  const handleSizeChange = (event: SelectChangeEvent<string>) => {
    setSettings({
      ...settings,
      imageSize: event.target.value as ImageSize
    });
  };

  const handleStyleChange = (event: SelectChangeEvent<string>) => {
    setSettings({
      ...settings,
      imageStyle: event.target.value as 'vivid' | 'natural'
    });
  };

  const handleQualityChange = (event: SelectChangeEvent<string>) => {
    setSettings({
      ...settings,
      imageQuality: event.target.value as 'standard' | 'hd'
    });
  };

  const handleUploadPreviousImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSettings({
      ...settings,
      uploadPreviousImage: event.target.checked
    });
  };

  const handleSDProviderChange = (event: SelectChangeEvent<string>) => {
    setSettings({
      ...settings,
      stableDiffusionProvider: event.target.value as StableDiffusionProvider
    });
  };

  const handleSDHostChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    let value = event.target.value.trim();
    // Add protocol if missing
    if (value && value.length > 0 && !value.startsWith('http')) {
      value = 'http://' + value;
    }
    setSettings({
      ...settings,
      stableDiffusionHost: value
    });
  };

  const handleSDAPIKeyChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSettings({
      ...settings,
      stableDiffusionAPIKey: event.target.value
    });
  };

  // Only show style and quality settings for DALL-E 3
  const isDallE3Selected = settings.imageGenerationModel === ImageGenerationModel.DALLE3;
  const isGPT4oSelected = settings.imageGenerationModel === ImageGenerationModel.GPT4o;
  const isStableDiffusionSelected = settings.imageGenerationModel === ImageGenerationModel.StableDiffusion;
  const sdProvider = settings.stableDiffusionProvider || StableDiffusionProvider.Local;
  const isLocalSD = sdProvider === StableDiffusionProvider.Local;
  const needsAPIKey = sdProvider === StableDiffusionProvider.StableDiffusionAPI || 
                      sdProvider === StableDiffusionProvider.Replicate;
  const isCustomSD = sdProvider === StableDiffusionProvider.Custom;

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          p: 1,
          borderBottom: `1px solid ${theme.palette.divider}`,
          bgcolor: theme.palette.background.paper,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel id="model-label">{t('Model')}</InputLabel>
          <Select
            labelId="model-label"
            label={t('Model')}
            value={settings.imageGenerationModel || ImageGenerationModel.GPT4o}
            onChange={handleModelChange}
            variant="outlined"
          >
            <MenuItem value={ImageGenerationModel.GPT4o}>GPT-4o</MenuItem>
            <MenuItem value={ImageGenerationModel.DALLE3}>DALL-E 3</MenuItem>
            <MenuItem value={ImageGenerationModel.DALLE2}>DALL-E 2</MenuItem>
            <MenuItem value={ImageGenerationModel.StableDiffusion}>Stable Diffusion</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel id="size-label">{t('Size')}</InputLabel>
          <Select
            labelId="size-label"
            label={t('Size')}
            value={settings.imageSize || '1024x1024'}
            onChange={handleSizeChange}
            variant="outlined"
          >
            <MenuItem value="1024x1024">1024 x 1024 (Square)</MenuItem>
            <MenuItem value="1024x1792">1024 x 1792 (Portrait)</MenuItem>
            <MenuItem value="1792x1024">1792 x 1024 (Landscape)</MenuItem>
            <MenuItem value="512x512">512 x 512 (Small)</MenuItem>
          </Select>
        </FormControl>

        {isDallE3Selected && (
          <>
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel id="style-label">{t('Style')}</InputLabel>
              <Select
                labelId="style-label"
                label={t('Style')}
                value={settings.imageStyle || 'vivid'}
                onChange={handleStyleChange}
                variant="outlined"
              >
                <MenuItem value="vivid">Vivid</MenuItem>
                <MenuItem value="natural">Natural</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 100 }}>
              <InputLabel id="quality-label">{t('Quality')}</InputLabel>
              <Select
                labelId="quality-label"
                label={t('Quality')}
                value={settings.imageQuality || 'standard'}
                onChange={handleQualityChange}
                variant="outlined"
              >
                <MenuItem value="standard">Standard</MenuItem>
                <MenuItem value="hd">HD</MenuItem>
              </Select>
            </FormControl>
          </>
        )}

        {isGPT4oSelected && (
          <>
            <FormControlLabel
              control={
                <Checkbox
                  checked={settings.uploadPreviousImage || false}
                  onChange={handleUploadPreviousImageChange}
                  color="primary"
                />
              }
              label={
                <Typography variant="body2">
                  {t('Upload previous image')}
                </Typography>
              }
              sx={{ ml: 1 }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
              {t('Allows for refinement with visible annotations')}
            </Typography>
          </>
        )}

        {isStableDiffusionSelected && (
          <>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel id="provider-label">{t('Provider')}</InputLabel>
              <Select
                labelId="provider-label"
                label={t('Provider')}
                value={sdProvider}
                onChange={handleSDProviderChange}
                variant="outlined"
              >
                <MenuItem value={StableDiffusionProvider.Local}>Local API</MenuItem>
                <MenuItem value={StableDiffusionProvider.StableDiffusionAPI}>StableDiffusionAPI.com</MenuItem>
                <MenuItem value={StableDiffusionProvider.Replicate}>Replicate.com</MenuItem>
                <MenuItem value={StableDiffusionProvider.Custom}>Custom API</MenuItem>
              </Select>
            </FormControl>

            <Button
              size="small"
              variant="outlined"
              onClick={() => setShowAdvancedDialog(true)}
              startIcon={<Settings />}
            >
              {t('Advanced')}
            </Button>
          </>
        )}
      </Box>

      {/* Advanced Settings Dialog for Stable Diffusion */}
      <Dialog open={showAdvancedDialog && isStableDiffusionSelected} onClose={() => setShowAdvancedDialog(false)}>
        <DialogTitle>{t('Stable Diffusion Settings')}</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {isLocalSD && (
              <TextField
                label={t('Local API URL')}
                fullWidth
                variant="outlined"
                value={settings.stableDiffusionHost || 'http://localhost:7860'}
                onChange={handleSDHostChange}
                placeholder="http://localhost:7860"
                helperText={t('URL for your local Stable Diffusion API')}
              />
            )}

            {needsAPIKey && (
              <TextField
                label={t('API Key')}
                fullWidth
                variant="outlined"
                type={showPassword ? 'text' : 'password'}
                value={settings.stableDiffusionAPIKey || ''}
                onChange={handleSDAPIKeyChange}
                placeholder={
                  sdProvider === StableDiffusionProvider.StableDiffusionAPI 
                  ? "Your StableDiffusionAPI.com API key" 
                  : "Your Replicate.com API key"
                }
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            )}

            {isCustomSD && (
              <>
                <TextField
                  label={t('Custom API URL')}
                  fullWidth
                  variant="outlined"
                  value={settings.stableDiffusionHost || ''}
                  onChange={handleSDHostChange}
                  placeholder="https://your-custom-api.com/endpoint"
                  helperText={t('Full URL for your custom Stable Diffusion API endpoint')}
                />
                
                <TextField
                  label={t('API Key (if required)')}
                  fullWidth
                  variant="outlined"
                  type={showPassword ? 'text' : 'password'}
                  value={settings.stableDiffusionAPIKey || ''}
                  onChange={handleSDAPIKeyChange}
                  placeholder="Optional API key for your custom endpoint"
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPassword(!showPassword)}
                          edge="end"
                        >
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowAdvancedDialog(false)} color="primary">
            {t('Close')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
} 