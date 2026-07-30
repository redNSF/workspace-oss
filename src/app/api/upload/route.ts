import { createHash } from "crypto";
import { NextRequest } from "next/server";
import { CLOUDINARY_FOLDER } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function signCloudinary(params: Record<string, string>, apiSecret: string): string {
  const paramString = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha1").update(paramString + apiSecret).digest("hex");
}

async function destroyCloudinaryImage({
  publicId,
  cloudName,
  apiKey,
  apiSecret,
}: {
  publicId: string;
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signCloudinary({ public_id: publicId, timestamp }, apiSecret);
  const form = new FormData();
  form.append("public_id", publicId);
  form.append("api_key", apiKey);
  form.append("timestamp", timestamp);
  form.append("signature", signature);

  return fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
    method: "POST",
    body: form,
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return Response.json(
      {
        error:
          "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.",
      },
      { status: 500 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  const itemId = formData.get("item_id");

  if (typeof itemId !== "string" || !UUID_PATTERN.test(itemId)) {
    return Response.json({ error: "A valid item_id is required" }, { status: 400 });
  }

  const { data: canUpload, error: permissionError } = await supabase.rpc(
    "user_can_edit_item",
    {
      p_item_id: itemId,
      p_user_id: user.id,
    },
  );

  if (permissionError || !canUpload) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!file || !(file instanceof File)) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return Response.json({ error: "Only image files are allowed" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return Response.json({ error: "File size exceeds the 5 MB limit" }, { status: 400 });
  }

  const timestamp = String(Math.floor(Date.now() / 1000));
  const folder = CLOUDINARY_FOLDER;
  const paramsToSign: Record<string, string> = { folder, timestamp };
  const signature = signCloudinary(paramsToSign, apiSecret);

  const uploadForm = new FormData();
  uploadForm.append("file", file);
  uploadForm.append("api_key", apiKey);
  uploadForm.append("timestamp", timestamp);
  uploadForm.append("signature", signature);
  uploadForm.append("folder", folder);

  const cloudinaryRes = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: "POST", body: uploadForm },
  );

  if (!cloudinaryRes.ok) {
    const detail = await cloudinaryRes.text();
    console.error("Cloudinary upload error:", detail);
    let errorMessage = "Failed to upload to Cloudinary";
    try {
      const parsed = JSON.parse(detail);
      if (parsed.error?.message) {
        errorMessage = `Cloudinary error: ${parsed.error.message}`;
      }
    } catch {
      // Keep the generic upstream error.
    }
    return Response.json({ error: errorMessage }, { status: 502 });
  }

  const result = (await cloudinaryRes.json()) as {
    secure_url: string;
    public_id: string;
  };

  const { data: photo, error: databaseError } = await supabase
    .from("item_photos")
    .insert({
      item_id: itemId,
      url: result.secure_url,
      public_id: result.public_id,
      uploaded_by: user.id,
    })
    .select("*")
    .single();

  if (databaseError || !photo) {
    const cleanupResponse = await destroyCloudinaryImage({
      publicId: result.public_id,
      cloudName,
      apiKey,
      apiSecret,
    });
    if (!cleanupResponse.ok) {
      console.error("Failed to clean up Cloudinary upload after database error", {
        publicId: result.public_id,
        status: cleanupResponse.status,
      });
    }
    console.error("Failed to persist uploaded photo:", databaseError);
    return Response.json({ error: "Failed to save uploaded photo" }, { status: 500 });
  }

  return Response.json({ photo });
}
