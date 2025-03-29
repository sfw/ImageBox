import React from 'react'
import { TextField, Button } from '@mui/material'
import { useTranslation } from 'react-i18next'

export default function TextFieldReset(props: {
    defaultValue?: string
    value: string
    onValueChange: (value: string) => void
} & Omit<React.ComponentProps<typeof TextField>, 'defaultValue' | 'value' | 'onChange'>) {
    const { t } = useTranslation()
    const { defaultValue, value, onValueChange, ...restProps } = props
    const defaultVal = defaultValue || ''
    const handleReset = () => onValueChange(defaultVal)
    const handleMouseDown = (event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault()
    }
    
    return (
        <TextField
            {...restProps}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            InputProps={
                defaultVal === value
                    ? restProps.InputProps
                    : {
                        ...restProps.InputProps,
                        endAdornment: (
                            <Button variant='text' onClick={handleReset} onMouseDown={handleMouseDown}>
                                {t('reset')}
                            </Button>
                        ),
                    }
            }
        />
    )
}
