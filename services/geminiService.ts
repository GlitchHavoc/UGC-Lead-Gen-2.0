
import { GoogleGenAI, Type } from "@google/genai";
import { ProductLead, BrandPreference } from "../types";

// Discover leads using Gemini with Google Search grounding
export const discoverLeads = async (
  query: string, 
  pref: BrandPreference
): Promise<{ leads: ProductLead[], sources: any[] }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-flash-preview';

  const response = await ai.models.generateContent({
    model,
    contents: `Find 8 high-quality, relevant brands launched recently or trending on Product Hunt. 
    Focus on products that align with: ${query}. 
    Preferred Category: ${pref.targetType} (If "Both", provide a mix).
    Niche focus: ${pref.niche}.
    
    CRITICAL: Only include brands with active websites. 
    
    Return the result as a JSON array of objects.
    JSON structure: [{ name, tagline, website, description, industry, targetType, sourceUrl, isPhVerified, isActive }]
    The "targetType" field MUST be either "B2B" or "D2C". 
    Only return the raw JSON array.`,
    config: {
      tools: [{ googleSearch: {} }],
    }
  });

  const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  let rawLeads = [];
  
  try {
    const text = response.text || "[]";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const cleanJson = jsonMatch[0].replace(/\[\d+\]/g, '');
      rawLeads = JSON.parse(cleanJson);
    }
  } catch (e) {
    console.error("Failed to parse leads JSON", e);
    rawLeads = [];
  }

  const leads: ProductLead[] = Array.isArray(rawLeads) 
    ? rawLeads
        .filter((l: any) => l.isActive !== false)
        .map((l: any, idx: number) => ({
          ...l,
          id: `lead-${Date.now()}-${idx}`,
          status: 'new'
        }))
    : [];

  return { leads, sources };
};

// Search for a specific brand's details
export const searchSpecificBrand = async (brandName: string): Promise<{ lead: ProductLead | null, sources: any[] }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-flash-preview';

  const response = await ai.models.generateContent({
    model,
    contents: `Find the official brand details for a company named "${brandName}". 
    I need their official website, current tagline, a one-sentence description, their primary industry, and whether they are "B2B" or "D2C".
    Return the result as a JSON object.
    JSON structure: { name, tagline, website, description, industry, targetType, sourceUrl, isPhVerified, isActive }`,
    config: {
      tools: [{ googleSearch: {} }],
    }
  });

  const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  
  try {
    const text = response.text || "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const cleanJson = jsonMatch[0].replace(/\[\d+\]/g, '');
      const data = JSON.parse(cleanJson);
      const lead: ProductLead = {
        ...data,
        id: `manual-${Date.now()}`,
        status: 'new',
        isActive: true,
        isPhVerified: data.isPhVerified || false,
        targetType: data.targetType || 'D2C'
      };
      return { lead, sources };
    }
  } catch (e) {
    console.error("Failed to parse specific brand JSON", e);
  }
  return { lead: null, sources };
};

// Find specific contact information for a brand
export const findContactInfo = async (brandName: string, website: string): Promise<{ name: string, email: string, source: string, groundingSources: any[] }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-flash-preview';

  const response = await ai.models.generateContent({
    model,
    contents: `Locate a direct contact email AND the specific person's name (founder, marketing lead, or growth lead) for "${brandName}" (${website}). 
    Check LinkedIn, Product Hunt about sections, and their team pages.
    Return a JSON object with keys: name, email, and source.`,
    config: {
      tools: [{ googleSearch: {} }],
    }
  });

  const groundingSources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  
  try {
    const text = response.text || "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const cleanJson = jsonMatch[0].replace(/\[\d+\]/g, '');
      const data = JSON.parse(cleanJson);
      return { 
        name: data.name || "Founder", 
        email: data.email || "not found", 
        source: data.source || "Web Search",
        groundingSources 
      };
    }
    throw new Error("No JSON found");
  } catch (e) {
    const emailMatch = response.text?.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    return { 
      name: "Founder", 
      email: emailMatch ? emailMatch[0] : "not found", 
      source: "Semantic Fallback",
      groundingSources
    };
  }
};

// Generate a personalized outreach email
export const generateOutreachEmail = async (lead: ProductLead, userName: string, isFollowUp: boolean = false): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-flash-preview';

  const contextText = isFollowUp 
    ? `This is a FOLLOW-UP email. I am including a funny meme as an icebreaker. Keep the text very short and acknowledge the humor.`
    : `This is an INITIAL cold outreach email. You found them because they were on Product Hunt.`;

  const prompt = `${contextText}
  
  Write a short, punchy email for a UGC creator reaching out to "${lead.name}".
  
  Brand Context: ${lead.tagline}
  Brand Description: ${lead.description}
  Contact Person: ${lead.contactName || 'Marketing Team'}
  My name: ${userName || 'a creator'}
  
  Tone: Enthusiastic, professional, human.
  Max length: 120 words.
  
  CRITICAL WORDING: You MUST include this specific phrasing or very similar: "huge congrats for being on product launch it's actually how I found you guys". Use it naturally as the reason you are reaching out.
  
  CRITICAL: You MUST NOT include a "Subject:" line. Start directly with the greeting.`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
  });

  return response.text?.trim() || "Failed to generate pitch.";
};
