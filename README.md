MERMAID DIAGRAM: -

```mermaid
graph TB
    subgraph "MCP Server (mcp-server)"
        subgraph "MCP Protocol Layer"
            Transport[Transport<br/>- Stdio mode<br/>- HTTP mode :3001]
            Protocol[MCP Protocol Handler<br/>- Initialize<br/>- List tools<br/>- Call tools]
        end

        subgraph "Tool Registry (What Makes it MCP)"
            Registry[Tool Registry<br/>THE MCP SERVER CORE]
            
            DocTools[ Document Tools<br/>- uploadDocument<br/>- searchDocuments<br/>- listDocuments]
            
            MedTools[ Medical Tools<br/>- extractMedicalEntities<br/>- findSimilarCases<br/>- analyzePatientHistory<br/>- getMedicalInsights]
            
            EmbedTools[ Embedding Tools<br/>- generateEmbeddingLocal<br/>- chunkAndEmbedDocument<br/>- semanticSearchLocal]
        end

        subgraph "Service Layer (Tool Implementations)"
            PDF[PDF Service]
            OCR[OCR Service]
            NER[Medical NER]
            Embed[Local Embeddings]
        end

        subgraph "Storage"
            Mongo[(MongoDB<br/>Documents & Vectors)]
        end
    end

    %% MCP Protocol Flow
    Transport -->|MCP Messages| Protocol
    Protocol -->|"tools/list"| Registry
    Protocol -->|"tools/call"| Registry

    %% Tool Registration
    Registry --> DocTools
    Registry --> MedTools
    Registry --> EmbedTools

    %% Tool Implementation
    DocTools --> PDF
    DocTools --> OCR
    DocTools --> NER
    DocTools --> Embed
    MedTools --> NER
    MedTools --> Embed
    EmbedTools --> Embed

    %% Storage
    DocTools --> Mongo
    MedTools --> Mongo
    EmbedTools --> Mongo

    %% Styling
    classDef protocol fill:#e1f5fe,stroke:#0277bd
    classDef core fill:#f3e5f5,stroke:#7b1fa2,stroke-width:3px
    classDef tools fill:#c8e6c9,stroke:#2e7d32
    classDef service fill:#fce4ec,stroke:#c2185b
    classDef storage fill:#fff9c4,stroke:#f57f17

    class Transport,Protocol protocol
    class Registry core
    class DocTools,MedTools,EmbedTools tools
    class PDF,OCR,NER,Embed service
    class Mongo storage
