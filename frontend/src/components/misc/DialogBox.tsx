import React from 'react';

import { AlertCircle, CheckCircle } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ConfirmationDialogProps {
  type: 'error' | 'success' | 'info'; // Extend this as needed
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmButtonText?: string; // Optional custom confirm button text
  cancelButtonText?: string; // Optional custom cancel button text
}

const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  type,
  message,
  onConfirm,
  onCancel,
  confirmButtonText = 'Confirm', // Default text
  cancelButtonText = 'Cancel', // Default text
}) => {
  if (!message) return null;

  const isError = type === 'error';
  const icon = isError ? (
    <AlertCircle className="mr-2 h-5 w-5 text-red-500" aria-hidden="true" />
  ) : (
    <CheckCircle className="mr-2 h-5 w-5 text-green-500" aria-hidden="true" />
  );

  const title = isError ? 'Error' : 'Confirmation';

  return (
    <AlertDialog open={!!message} onOpenChange={onCancel}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center">
            {icon}
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{cancelButtonText}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{confirmButtonText}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ConfirmationDialog;
