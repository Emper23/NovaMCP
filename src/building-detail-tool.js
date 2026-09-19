const TOOL_NAME = "analyze_building_detail";

export const buildingDetailTools = [
  {
    name: TOOL_NAME,
    title: "Analyze Building Detail",
    description:
      "Read-only architectural detail audit for a Roblox building/model. " +
      "Analyzes proportions, repetitive geometry, facade articulation, window/balcony/entrance/roof detail, " +
      "material and color variety, and horizontal-band dominance. Returns heuristic scores, metrics, issues, " +
      "and concrete recommendations. Use this before approving or detailing condos, apartments, offices, towers, " +
      "and other buildings. This tool does not modify the place and does not replace a visual screen_capture review.",
    inputSchema: {
      type: "object",
      properties: {
        studio_id: {
          type: "string",
          description: "Connected Roblox Studio instance id."
        },
        target_path: {
          type: "string",
          description: "Dot path to the building/model, for example Workspace.City.CondoA.",
          default: "Workspace"
        },
        building_type: {
          type: "string",
          enum: ["condo", "apartment", "office", "tower", "generic"],
          default: "generic",
          description: "Building type used to tune recommendations."
        },
        strictness: {
          type: "string",
          enum: ["quick", "standard", "strict"],
          default: "standard",
          description: "How aggressively the heuristic flags missing detail."
        },
        max_parts: {
          type: "integer",
          minimum: 50,
          maximum: 5000,
          default: 2500,
          description: "Maximum number of BaseParts sampled from the target."
        }
      },
      required: ["studio_id"],
      additionalProperties: false
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  }
];

export function isBuildingDetailTool(name) {
  return name === TOOL_NAME;
}

function luauString(value) {
  return '"' + String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n") + '"';
}

function buildAnalyzerLuau(args) {
  const targetPath = String(args?.target_path || "Workspace").trim() || "Workspace";
  const buildingType = ["condo", "apartment", "office", "tower", "generic"].includes(args?.building_type)
    ? args.building_type : "generic";
  const strictness = ["quick", "standard", "strict"].includes(args?.strictness)
    ? args.strictness : "standard";
  const maxParts = Math.max(50, Math.min(5000, Number(args?.max_parts) || 2500));

  return `
local HttpService = game:GetService("HttpService")

local TARGET_PATH = ${luauString(targetPath)}
local BUILDING_TYPE = ${luauString(buildingType)}
local STRICTNESS = ${luauString(strictness)}
local MAX_PARTS = ${maxParts}

local function round(n, step)
    step = step or 1
    return math.floor((n / step) + 0.5) * step
end

local function clamp(n, lo, hi)
    return math.max(lo, math.min(hi, n))
end

local function countKeys(t)
    local n = 0
    for _ in pairs(t) do n += 1 end
    return n
end

local function lower(v)
    return string.lower(tostring(v or ""))
end

local function hasAny(text, words)
    text = lower(text)
    for _, word in ipairs(words) do
        if string.find(text, word, 1, true) then
            return true
        end
    end
    return false
end

local function resolvePath(path)
    local clean = tostring(path or "")
    clean = string.gsub(clean, "^game%.", "")
    if clean == "" or clean == "game" then return game end

    local node = game
    local first = true
    for segment in string.gmatch(clean, "[^%.]+") do
        if first and lower(segment) == "workspace" then
            node = workspace
        else
            local found = node:FindFirstChild(segment)
            if not found then
                for _, child in ipairs(node:GetChildren()) do
                    if lower(child.Name) == lower(segment) then
                        found = child
                        break
                    end
                end
            end
            if not found then
                return nil, "Path segment not found: " .. segment
            end
            node = found
        end
        first = false
    end
    return node
end

local target, pathError = resolvePath(TARGET_PATH)
if not target then
    return HttpService:JSONEncode({
        ok = false,
        error = pathError or "Target path not found",
        target_path = TARGET_PATH
    })
end

local parts = {}
if target:IsA("BasePart") then
    table.insert(parts, target)
else
    for _, item in ipairs(target:GetDescendants()) do
        if item:IsA("BasePart") then
            table.insert(parts, item)
            if #parts >= MAX_PARTS then break end
        end
    end
end

if #parts == 0 then
    return HttpService:JSONEncode({
        ok = false,
        error = "No BasePart descendants found",
        target_path = TARGET_PATH
    })
end

local minV = Vector3.new(math.huge, math.huge, math.huge)
local maxV = Vector3.new(-math.huge, -math.huge, -math.huge)

local materials = {}
local colors = {}
local facadeMaterials = {}
local facadeColors = {}
local sizeSigs = {}
local facadeSigs = {}
local facadePartCount = 0
local windowCandidates = {}
local yBands = {}
local xLayers = {}
local zLayers = {}

local classCounts = {}
local windowLike = 0
local balconyLike = 0
local entranceLike = 0
local roofLike = 0
local trimLike = 0
local wallLike = 0
local horizontalStripLike = 0
local transparentLike = 0
local meshLike = 0

local keywords = {
    window = {"window", "glass", "กระจก"},
    balcony = {"balcony", "rail", "railing", "terrace", "ระเบียง"},
    entrance = {"door", "entrance", "entry", "lobby", "reception", "ประตู", "ล็อบบี้"},
    roof = {"roof", "parapet", "hvac", "mechanical", "antenna", "water tank", "rooftop", "ดาดฟ้า", "หลังคา"},
    trim = {"frame", "trim", "mullion", "column", "pillar", "beam", "cornice", "ledge", "กรอบ", "เสา"},
    wall = {"wall", "facade", "panel", "cladding", "ผนัง"}
}

local pivot = CFrame.new()
if target:IsA("Model") then
    pivot = target:GetPivot()
elseif target:IsA("BasePart") then
    pivot = target.CFrame
end

for _, part in ipairs(parts) do
    classCounts[part.ClassName] = (classCounts[part.ClassName] or 0) + 1
    if part:IsA("MeshPart") or part.ClassName == "UnionOperation" then meshLike += 1 end

    materials[tostring(part.Material)] = true

    local c = part.Color
    local cr = math.floor(c.R * 7 + 0.5)
    local cg = math.floor(c.G * 7 + 0.5)
    local cb = math.floor(c.B * 7 + 0.5)
    colors[cr .. ":" .. cg .. ":" .. cb] = true

    local s = part.Size
    local sig = string.format("%.2f:%.2f:%.2f:%s:%d",
        round(s.X, 0.25), round(s.Y, 0.25), round(s.Z, 0.25),
        tostring(part.Material), math.floor(part.Transparency * 4 + 0.5))
    sizeSigs[sig] = (sizeSigs[sig] or 0) + 1

    local localPos = pivot:PointToObjectSpace(part.Position)
    yBands[tostring(round(part.Position.Y, 1.5))] = (yBands[tostring(round(part.Position.Y, 1.5))] or 0) + 1
    xLayers[tostring(round(localPos.X, 1.0))] = true
    zLayers[tostring(round(localPos.Z, 1.0))] = true

    local n = part.Name
    local isWindow = hasAny(n, keywords.window) or part.Material == Enum.Material.Glass or (part.Transparency >= 0.2 and part.Transparency < 0.95)
    local isBalcony = hasAny(n, keywords.balcony)
    local isEntrance = hasAny(n, keywords.entrance)
    local isRoof = hasAny(n, keywords.roof)
    local isTrim = hasAny(n, keywords.trim)
    local isWall = hasAny(n, keywords.wall)

    if isWindow then
        windowLike += 1
        table.insert(windowCandidates, { x = s.X, y = s.Y, z = s.Z, name = n })
    end
    if part.Transparency >= 0.2 and part.Transparency < 0.95 then transparentLike += 1 end
    if isBalcony then balconyLike += 1 end
    if isEntrance then entranceLike += 1 end
    if isRoof then roofLike += 1 end
    if isTrim then trimLike += 1 end
    if isWall then wallLike += 1 end

    local isFacadeLike = isWindow or isBalcony or isEntrance or isRoof or isTrim or isWall
    if isFacadeLike then
        facadePartCount += 1
        facadeMaterials[tostring(part.Material)] = true
        facadeColors[cr .. ":" .. cg .. ":" .. cb] = true
        facadeSigs[sig] = (facadeSigs[sig] or 0) + 1
    end

    local namedBand = isWindow and hasAny(n, {"strip", "band", "ribbon"})
    local horizontal = (s.Y <= 3.25 and math.max(s.X, s.Z) >= 8 and math.min(s.X, s.Z) <= 4)
        or (namedBand and math.max(s.X, s.Z) >= 12)
    if horizontal then horizontalStripLike += 1 end

    local half = s * 0.5
    for _, sx in ipairs({-1, 1}) do
        for _, sy in ipairs({-1, 1}) do
            for _, sz in ipairs({-1, 1}) do
                local p = part.CFrame:PointToWorldSpace(Vector3.new(half.X * sx, half.Y * sy, half.Z * sz))
                minV = Vector3.new(math.min(minV.X, p.X), math.min(minV.Y, p.Y), math.min(minV.Z, p.Z))
                maxV = Vector3.new(math.max(maxV.X, p.X), math.max(maxV.Y, p.Y), math.max(maxV.Z, p.Z))
            end
        end
    end
end

local bounds = maxV - minV
local width = math.max(bounds.X, bounds.Z)
local depth = math.min(bounds.X, bounds.Z)
local height = bounds.Y
local aspect = height / math.max(width, 0.001)
local slenderness = height / math.max(depth, 0.001)

local topSigCount = 0
local repeatedCount = 0
for _, count in pairs(sizeSigs) do
    if count > topSigCount then topSigCount = count end
    if count >= 4 then repeatedCount += count end
end

local partCount = #parts
local topSignatureShare = topSigCount / partCount
local repeatedShare = repeatedCount / partCount
local stripShare = horizontalStripLike / partCount
local windowShare = windowLike / partCount

local facadeTopSigCount = 0
local facadeRepeatedCount = 0
for _, count in pairs(facadeSigs) do
    if count > facadeTopSigCount then facadeTopSigCount = count end
    if count >= 4 then facadeRepeatedCount += count end
end
local facadeRepeatedShare = facadeRepeatedCount / math.max(facadePartCount, 1)

local monolithicWindowCount = 0
for _, item in ipairs(windowCandidates) do
    local horizontalSpan = math.max(item.x, item.z)
    local thickness = math.min(item.x, item.z)
    local coversFacade = horizontalSpan >= width * 0.55
    local isThinPlane = thickness <= math.max(3, width * 0.08)
    local isFloorTall = item.y >= 4
    if coversFacade and isThinPlane and isFloorTall then
        monolithicWindowCount += 1
    end
end
local monolithicWindowShare = monolithicWindowCount / math.max(windowLike, 1)

local xLayerCount = countKeys(xLayers)
local zLayerCount = countKeys(zLayers)
local depthLayerCount = math.min(xLayerCount, zLayerCount)
local materialCount = countKeys(materials)
local colorCount = countKeys(colors)
local facadeMaterialCount = countKeys(facadeMaterials)
local facadeColorCount = countKeys(facadeColors)
local yBandCount = countKeys(yBands)

local issues = {}
local recommendations = {}

local function issue(code, severity, message)
    table.insert(issues, { code = code, severity = severity, message = message })
end
local function recommend(text)
    table.insert(recommendations, text)
end

local repetitionScore = 100
if topSignatureShare > 0.42 then
    repetitionScore -= 38
    issue("dominant_repeated_module", "high", "One geometry signature dominates the building; the facade is likely visibly repetitive.")
elseif topSignatureShare > 0.28 then
    repetitionScore -= 24
    issue("dominant_repeated_module", "medium", "A large share of parts use the same size/material signature.")
elseif topSignatureShare > 0.18 then
    repetitionScore -= 10
end
if repeatedShare > 0.82 then
    repetitionScore -= 34
elseif repeatedShare > 0.72 then
    repetitionScore -= 24
elseif repeatedShare > 0.55 then
    repetitionScore -= 12
end
if facadeRepeatedShare > 0.78 then
    repetitionScore -= 12
    issue("facade_module_repetition", "medium", "Most facade-like elements come from a small set of repeated geometry signatures.")
end
if monolithicWindowShare > 0.75 then
    repetitionScore -= 22
    issue("monolithic_facade_panels", "high", "Most window/glass elements span a large portion of the facade as repeated full-width panels.")
elseif monolithicWindowShare > 0.45 then
    repetitionScore -= 12
    issue("monolithic_facade_panels", "medium", "Many window/glass elements are broad facade-spanning panels instead of subdivided bays.")
end
if stripShare > 0.34 then
    repetitionScore -= 20
    issue("horizontal_band_dominance", "high", "The building is dominated by repeated strip/band geometry, which can read like stacked shelves.")
elseif stripShare > 0.20 then
    repetitionScore -= 12
    issue("horizontal_band_dominance", "medium", "Many repeated strip/band elements run across the facade.")
end
repetitionScore = clamp(repetitionScore, 0, 100)

local facadeScore = 30
facadeScore += clamp(windowShare * 220, 0, 24)
facadeScore += clamp((trimLike / partCount) * 500, 0, 18)
if monolithicWindowShare < 0.45 then
    facadeScore += clamp((depthLayerCount - 1) * 2, 0, 10)
end
facadeScore += clamp((balconyLike / math.max(partCount, 1)) * 400, 0, 8)
if monolithicWindowShare > 0.75 then
    facadeScore -= 34
elseif monolithicWindowShare > 0.45 then
    facadeScore -= 22
end
if stripShare > 0.20 then facadeScore -= 8 end
facadeScore = clamp(facadeScore, 0, 100)

if windowLike == 0 then
    issue("missing_window_language", "high", "No window/glass-like facade elements were detected.")
    recommend("Add clear window bays with frames/mullions instead of relying on broad horizontal strips.")
elseif windowShare < 0.035 then
    issue("weak_window_language", "medium", "Window/glass-like detail is sparse relative to the building size.")
    recommend("Increase the number of readable window modules and vary selected bays.")
end

if monolithicWindowShare > 0.45 then
    recommend("Subdivide facade-spanning glass/WindowStrip panels into smaller window bays with mullions, slab edges, and selected solid wall sections.")
    recommend("Do not count a full-floor glass strip as many details just because it is duplicated across floors; create readable modules within each floor.")
end

if trimLike == 0 then
    issue("missing_trim_depth", "medium", "No named frame/trim/column/mullion detail was detected.")
    recommend("Add frames, mullions, vertical columns, ledges, or cornice pieces to create facade depth.")
end

if depthLayerCount <= 2 then
    issue("flat_facade", "medium", "Very few facade depth layers were detected.")
    recommend("Offset facade elements by roughly 0.5-2 studs to create shadow lines and depth.")
end

local featureScore = 20
if entranceLike > 0 then featureScore += 25 else
    issue("missing_entrance_identity", "medium", "No obvious lobby/entrance/door identity was detected.")
    recommend("Make the ground-floor entrance distinct with a lobby opening, canopy, doors, and lighting.")
end
if roofLike > 0 then featureScore += 18 else
    issue("missing_roof_detail", "low", "No obvious roof/parapet/mechanical detail was detected.")
    recommend("Add a parapet and a small rooftop/mechanical silhouette so the tower does not end as a plain box.")
end
if trimLike > 0 then featureScore += 17 end
if BUILDING_TYPE == "condo" or BUILDING_TYPE == "apartment" then
    if balconyLike > 0 then
        featureScore += 20
    else
        issue("no_balcony_variation", "low", "No balcony/terrace naming was detected for this residential building.")
        recommend("Consider balconies on selected stacks or floors instead of repeating them everywhere.")
    end
else
    featureScore += math.min(20, balconyLike * 2)
end
featureScore = clamp(featureScore, 0, 100)

local effectiveMaterialCount = facadePartCount > 0 and facadeMaterialCount or materialCount
local effectiveColorCount = facadePartCount > 0 and facadeColorCount or colorCount
local varietyScore = 35
varietyScore += clamp((effectiveMaterialCount - 1) * 12, 0, 32)
varietyScore += clamp((effectiveColorCount - 1) * 4, 0, 25)
if monolithicWindowShare > 0.75 then varietyScore = math.min(varietyScore, 78) end
varietyScore = clamp(varietyScore, 0, 100)
if effectiveMaterialCount < 2 then
    issue("low_material_variety", "medium", "The building uses very little material variation.")
    recommend("Use clear material roles such as wall, glass, metal trim, and a distinct ground-floor material.")
elseif effectiveMaterialCount < 3 and STRICTNESS == "strict" then
    issue("limited_material_palette", "low", "Material palette is controlled but may be too uniform for a close-up hero building.")
end

local compositionScore = 100
if aspect > 7.5 then
    compositionScore -= 22
    issue("extreme_slenderness", "medium", "The building is extremely tall relative to its width.")
elseif aspect < 0.65 and BUILDING_TYPE ~= "generic" then
    compositionScore -= 12
end
if slenderness > 14 then compositionScore -= 10 end
if partCount < 30 then
    compositionScore -= 25
    issue("low_geometry_density", "high", "Very few parts were found for the building volume.")
elseif partCount < 70 then
    compositionScore -= 12
    issue("low_geometry_density", "medium", "Geometry density is low for a building intended to be viewed up close.")
end
compositionScore = clamp(compositionScore, 0, 100)

local detailDensityScore
if partCount >= 450 then detailDensityScore = 100
elseif partCount >= 220 then detailDensityScore = 90
elseif partCount >= 120 then detailDensityScore = 78
elseif partCount >= 70 then detailDensityScore = 64
elseif partCount >= 35 then detailDensityScore = 50
else detailDensityScore = 30 end

if STRICTNESS == "strict" then
    detailDensityScore = clamp(detailDensityScore - 8, 0, 100)
elseif STRICTNESS == "quick" then
    detailDensityScore = clamp(detailDensityScore + 8, 0, 100)
end

local overall = math.floor(
    repetitionScore * 0.23 +
    facadeScore * 0.25 +
    featureScore * 0.19 +
    varietyScore * 0.13 +
    compositionScore * 0.10 +
    detailDensityScore * 0.10 + 0.5
)

if topSignatureShare > 0.28 or facadeRepeatedShare > 0.72 then
    recommend("Create 3-5 facade module variants and alternate them by floor/stack instead of cloning one strip.")
end
if stripShare > 0.20 then
    recommend("Break continuous horizontal bands into window bays, slab edges, vertical mullions, and occasional balcony modules.")
end
if colorCount < 4 then
    recommend("Keep a controlled palette, but add subtle value/material differences so floors do not merge into one flat stack.")
end
if wallLike == 0 and partCount > 40 then
    recommend("Use meaningful names/groups for facade systems (Wall, Window, Balcony, Trim, Roof). It improves future automated review accuracy.")
end

local verdict
if overall >= 85 then verdict = "high_detail"
elseif overall >= 70 then verdict = "good_base_needs_polish"
elseif overall >= 55 then verdict = "medium_detail"
elseif overall >= 40 then verdict = "low_detail"
else verdict = "blockout_like" end

local report = {
    ok = true,
    tool = "analyze_building_detail",
    heuristic = true,
    target_path = TARGET_PATH,
    target_name = target.Name,
    target_class = target.ClassName,
    building_type = BUILDING_TYPE,
    strictness = STRICTNESS,
    sampled_parts = partCount,
    sample_capped = partCount >= MAX_PARTS,
    score = overall,
    verdict = verdict,
    scores = {
        repetition = math.floor(repetitionScore + 0.5),
        facade_detail = math.floor(facadeScore + 0.5),
        architectural_features = math.floor(featureScore + 0.5),
        material_visual_variety = math.floor(varietyScore + 0.5),
        composition = math.floor(compositionScore + 0.5),
        geometry_density = math.floor(detailDensityScore + 0.5)
    },
    bounds = {
        width = round(width, 0.1),
        height = round(height, 0.1),
        depth = round(depth, 0.1),
        height_to_width = round(aspect, 0.01),
        height_to_depth = round(slenderness, 0.01)
    },
    metrics = {
        materials = materialCount,
        color_buckets = colorCount,
        facade_materials = facadeMaterialCount,
        facade_color_buckets = facadeColorCount,
        facade_like_parts = facadePartCount,
        class_counts = classCounts,
        y_bands = yBandCount,
        spatial_layer_proxy = depthLayerCount,
        top_geometry_signature_share = round(topSignatureShare, 0.001),
        repeated_geometry_share = round(repeatedShare, 0.001),
        facade_repeated_geometry_share = round(facadeRepeatedShare, 0.001),
        horizontal_strip_share = round(stripShare, 0.001),
        monolithic_window_panels = monolithicWindowCount,
        monolithic_window_share = round(monolithicWindowShare, 0.001),
        window_like_parts = windowLike,
        window_like_share = round(windowShare, 0.001),
        transparent_parts = transparentLike,
        balcony_like_parts = balconyLike,
        entrance_like_parts = entranceLike,
        roof_like_parts = roofLike,
        trim_like_parts = trimLike,
        wall_like_parts = wallLike,
        mesh_or_union_parts = meshLike
    },
    issues = issues,
    recommendations = recommendations,
    note = "Heuristic geometry audit only. Combine with screen_capture for final visual judgement."
}

return HttpService:JSONEncode(report)
`;
}

export async function callBuildingDetailTool(name, args, callRobloxTool) {
  if (name !== TOOL_NAME) throw new Error("Unknown building detail tool");
  const studioId = String(args?.studio_id || "").trim();
  if (!studioId) throw new Error("studio_id is required");

  const code = buildAnalyzerLuau(args);
  return callRobloxTool("execute_luau", {
    studio_id: studioId,
    datamodel_type: "Edit",
    code
  });
}
