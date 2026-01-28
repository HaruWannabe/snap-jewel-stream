/**
 * Simple blur detection using Laplacian variance
 * Higher variance = sharper image
 */
export async function detectBlur(imageBlob: Blob): Promise<{ isBlurry: boolean; score: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(imageBlob);
    
    img.onload = () => {
      // Create canvas for analysis
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        URL.revokeObjectURL(url);
        resolve({ isBlurry: false, score: 100 }); // Default to not blurry if can't analyze
        return;
      }
      
      // Use smaller size for faster processing
      const maxSize = 256;
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      canvas.width = Math.floor(img.width * scale);
      canvas.height = Math.floor(img.height * scale);
      
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const variance = calculateLaplacianVariance(imageData);
      
      URL.revokeObjectURL(url);
      
      // Threshold determined empirically - lower values indicate blur
      // Typical sharp images have variance > 100, blurry < 50
      const threshold = 50;
      const isBlurry = variance < threshold;
      
      resolve({ isBlurry, score: Math.min(variance, 200) });
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ isBlurry: false, score: 100 }); // Default to not blurry on error
    };
    
    img.src = url;
  });
}

function calculateLaplacianVariance(imageData: ImageData): number {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  
  // Convert to grayscale and apply Laplacian kernel
  const gray: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  
  // Laplacian kernel: [0, 1, 0], [1, -4, 1], [0, 1, 0]
  const laplacian: number[] = [];
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const lap = 
        gray[idx - width] +
        gray[idx - 1] +
        gray[idx + 1] +
        gray[idx + width] -
        4 * gray[idx];
      laplacian.push(lap);
    }
  }
  
  // Calculate variance
  const mean = laplacian.reduce((a, b) => a + b, 0) / laplacian.length;
  const variance = laplacian.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / laplacian.length;
  
  return variance;
}
