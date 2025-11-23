import { put, list, del } from '@vercel/blob';

export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
};

export default async function handler(request) {
  const url = new URL(request.url);
  const { searchParams } = url;
  const action = searchParams.get('action') || 'unknown';
  
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS (CORS preflight)
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Route 1: Upload Image/Video
    if (action === 'upload') {
      if (request.method !== 'POST') {
        return jsonResponse({ success: false, error: 'Method not allowed' }, 405, corsHeaders);
      }

      const filename = searchParams.get('filename') || `upload_${Date.now()}.jpg`;
      
      const blob = await put(`uploads/${filename}`, request.body, {
        access: 'public',
        addRandomSuffix: true,
      });

      return jsonResponse({
        success: true,
        url: blob.url,
        downloadUrl: blob.downloadUrl,
        size: blob.size,
        uploadedAt: new Date().toISOString()
      }, 200, corsHeaders);
    }

    // Route 2: CC Filter Management
    if (action === 'cc') {
      
      // GET: List all CC filters
      if (request.method === 'GET') {
        const { blobs } = await list({ prefix: 'cc-filters/', limit: 100 });

        const filters = await Promise.all(
          blobs.map(async (blob) => {
            try {
              const response = await fetch(blob.url);
              const data = await response.json();
              return {
                name: data.name || blob.pathname.split('/').pop(),
                url: blob.url,
                uploadedAt: blob.uploadedAt,
                size: blob.size,
                values: data.values || data
              };
            } catch {
              return null;
            }
          })
        );

        return jsonResponse({
          success: true,
          filters: filters.filter(f => f !== null),
          count: filters.filter(f => f !== null).length
        }, 200, corsHeaders);
      }

      // POST: Upload new CC filter
      if (request.method === 'POST') {
        const ccData = await request.json();
        
        if (!ccData.name || !ccData.values) {
          return jsonResponse({
            success: false,
            error: 'Missing name or values'
          }, 400, corsHeaders);
        }

        const safeName = ccData.name.replace(/[^a-zA-Z0-9-_]/g, '_');
        const filename = `cc-filters/${safeName}_${Date.now()}.json`;

        const blob = await put(filename, JSON.stringify(ccData), {
          access: 'public',
          contentType: 'application/json',
        });

        return jsonResponse({
          success: true,
          url: blob.url,
          name: ccData.name,
          uploadedAt: new Date().toISOString()
        }, 200, corsHeaders);
      }

      // DELETE: Remove CC filter
      if (request.method === 'DELETE') {
        const deleteUrl = searchParams.get('url');
        
        if (!deleteUrl) {
          return jsonResponse({
            success: false,
            error: 'URL parameter required'
          }, 400, corsHeaders);
        }

        await del(deleteUrl);

        return jsonResponse({
          success: true,
          message: 'CC filter deleted successfully'
        }, 200, corsHeaders);
      }
    }

    // Route 3: Save Enhanced Image
    if (action === 'save-enhanced') {
      if (request.method !== 'POST') {
        return jsonResponse({ success: false, error: 'Method not allowed' }, 405, corsHeaders);
      }

      const body = await request.json();
      const { image, metadata } = body;

      if (!image) {
        return jsonResponse({
          success: false,
          error: 'No image provided'
        }, 400, corsHeaders);
      }

      const base64Match = image.match(/^data:image\/\w+;base64,(.+)$/);
      if (!base64Match) {
        return jsonResponse({
          success: false,
          error: 'Invalid image format'
        }, 400, corsHeaders);
      }

      const base64Data = base64Match[1];
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const filename = `enhanced/enhanced_${Date.now()}.jpg`;

      const blob = await put(filename, bytes, {
        access: 'public',
        contentType: 'image/jpeg',
      });

      if (metadata) {
        const metadataFilename = `metadata/meta_${Date.now()}.json`;
        await put(metadataFilename, JSON.stringify({
          ...metadata,
          imageUrl: blob.url,
          timestamp: new Date().toISOString(),
        }), {
          access: 'public',
          contentType: 'application/json',
        });
      }

      return jsonResponse({
        success: true,
        url: blob.url,
        downloadUrl: blob.downloadUrl,
        size: blob.size,
      }, 200, corsHeaders);
    }

    // Route 4: List All Uploads
    if (action === 'list-uploads') {
      if (request.method !== 'GET') {
        return jsonResponse({ success: false, error: 'Method not allowed' }, 405, corsHeaders);
      }

      const prefix = searchParams.get('prefix') || 'uploads/';
      const limit = parseInt(searchParams.get('limit') || '50');
      
      const { blobs } = await list({ prefix, limit });

      return jsonResponse({
        success: true,
        uploads: blobs.map(blob => ({
          url: blob.url,
          downloadUrl: blob.downloadUrl,
          pathname: blob.pathname,
          size: blob.size,
          uploadedAt: blob.uploadedAt,
        })),
        count: blobs.length
      }, 200, corsHeaders);
    }

    // Route 5: Delete Upload
    if (action === 'delete-upload') {
      if (request.method !== 'DELETE') {
        return jsonResponse({ success: false, error: 'Method not allowed' }, 405, corsHeaders);
      }

      const deleteUrl = searchParams.get('url');
      
      if (!deleteUrl) {
        return jsonResponse({
          success: false,
          error: 'URL parameter required'
        }, 400, corsHeaders);
      }

      await del(deleteUrl);

      return jsonResponse({
        success: true,
        message: 'Upload deleted successfully'
      }, 200, corsHeaders);
    }

    // Route 6: Get Metadata
    if (action === 'get-metadata') {
      if (request.method !== 'GET') {
        return jsonResponse({ success: false, error: 'Method not allowed' }, 405, corsHeaders);
      }

      const { blobs } = await list({ prefix: 'metadata/', limit: 100 });

      const metadata = await Promise.all(
        blobs.map(async (blob) => {
          try {
            const response = await fetch(blob.url);
            const data = await response.json();
            return {
              ...data,
              metadataUrl: blob.url,
              uploadedAt: blob.uploadedAt,
            };
          } catch {
            return null;
          }
        })
      );

      return jsonResponse({
        success: true,
        metadata: metadata.filter(m => m !== null),
        count: metadata.filter(m => m !== null).length
      }, 200, corsHeaders);
    }

    // Route 7: Health Check
    if (action === 'health') {
      return jsonResponse({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        availableActions: [
          'upload',
          'cc',
          'save-enhanced',
          'list-uploads',
          'delete-upload',
          'get-metadata',
          'health'
        ]
      }, 200, corsHeaders);
    }

    // Route not found
    return jsonResponse({
      success: false,
      error: 'Invalid action',
      availableActions: [
        'upload',
        'cc',
        'save-enhanced',
        'list-uploads',
        'delete-upload',
        'get-metadata',
        'health'
      ]
    }, 404, corsHeaders);

  } catch (error) {
    console.error('API Error:', error);
    return jsonResponse({
      success: false,
      error: error.message || 'Internal server error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, 500, corsHeaders);
  }
}

// Helper function
function jsonResponse(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: headers
  });
}
