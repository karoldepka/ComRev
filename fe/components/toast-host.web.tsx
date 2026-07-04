import { Toaster } from 'react-hot-toast';

export default function ToastHost() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        style: { maxWidth: 480, fontSize: 13 },
        error: { duration: 10000 },
      }}
    />
  );
}
