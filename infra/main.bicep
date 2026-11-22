// Only Container Apps are created here: the identity that deploys this file
// cannot write identities, role assignments or the environment.
// scripts/setup-github-deploy.sh creates both app identities and their
// AcrPull grants; this file refers to them and to the environment as existing.
//
// Easy Auth is intentionally NOT here — per-user role assignment can't be
// expressed in Bicep, so it stays in scripts/setup-easyauth.sh +
// scripts/approve-user.sh.

@description('Region for all resources. Defaults to the resource group location.')
param location string = resourceGroup().location

@description('Existing Azure Container Registry name.')
param acrName string = 'acrchatbotfredheda'

@description('Container Apps environment name.')
param environmentName string = 'cae-restaurant-researcher'

@description('Frontend (Next.js) container app name.')
param frontendAppName string = 'ca-restaurant-researcher-web'

@description('Api container app name.')
param apiAppName string = 'ca-restaurant-researcher-api'

@description('Agent container app name.')
param agentAppName string = 'ca-restaurant-researcher-agent'

@description('Existing user-assigned managed identity the web app pulls images as.')
param pullIdentityName string = 'id-restaurant-researcher-acrpull'

@description('Existing user-assigned managed identity the api and agent apps run as.')
param backendIdentityName string = 'id-restaurant-researcher-backend'

@description('Web image tag (a git commit SHA).')
param webImageTag string

@description('Api image tag (a git commit SHA).')
param apiImageTag string

@description('Agent image tag (a git commit SHA).')
param agentImageTag string

@description('Fully qualified host name of the Azure SQL server.')
param sqlServer string

@description('Database name on that server.')
param sqlDatabase string

// No default: an app's secrets are replaced on every deploy, so a default
// would overwrite a working key without an error.
@description('Google Places API key.')
@secure()
param googlePlacesKey string

@description('OpenAI API key.')
@secure()
param openaiApiKey string

var loginServer = '${acrName}.azurecr.io'

var backendApps = [
  { name: apiAppName, role: 'api', tag: apiImageTag }
  { name: agentAppName, role: 'agent', tag: agentImageTag }
]

resource pullIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: pullIdentityName
}

resource backendIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: backendIdentityName
}

resource environment 'Microsoft.App/managedEnvironments@2025-01-01' existing = {
  name: environmentName
}

resource backend 'Microsoft.App/containerApps@2025-01-01' = [for app in backendApps: {
  name: app.name
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${backendIdentity.id}': {}
    }
  }
  properties: {
    environmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: false
        targetPort: 8000
        transport: 'auto'
        allowInsecure: false
      }
      registries: [
        {
          server: loginServer
          identity: backendIdentity.id
        }
      ]
      secrets: concat(
        [{ name: 'google-places-key', value: googlePlacesKey }],
        app.role == 'agent' ? [{ name: 'openai-api-key', value: openaiApiKey }] : []
      )
    }
    template: {
      containers: [
        {
          name: 'restaurant-researcher-${app.role}'
          image: '${loginServer}/restaurant-researcher-backend:${app.tag}'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: concat(
            [
              { name: 'APP_ROLE', value: app.role }
              { name: 'GOOGLE_PLACES_API_KEY', secretRef: 'google-places-key' }
              { name: 'SQL_SERVER', value: sqlServer }
              { name: 'SQL_DATABASE', value: sqlDatabase }
              { name: 'AZURE_CLIENT_ID', value: backendIdentity.properties.clientId }
            ],
            app.role == 'agent' ? [{ name: 'OPENAI_API_KEY', secretRef: 'openai-api-key' }] : []
          )
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
      }
    }
  }
}]

resource frontend 'Microsoft.App/containerApps@2025-01-01' = {
  name: frontendAppName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${pullIdentity.id}': {}
    }
  }
  properties: {
    environmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
        // ARM treats `ingress` as authoritative: a deploy that omits
        // customDomains wipes the binding.
        customDomains: [
          {
            name: 'restaurants.frederikheda.com'
            bindingType: 'SniEnabled'
            certificateId: '${environment.id}/managedCertificates/mc-cae-restaurant-restaurants-fred-8760'
          }
        ]
      }
      // No `secrets` block: ARM treats it as the complete list, so declaring
      // one drops the Easy Auth secret that setup-easyauth.sh stores.
      registries: [
        {
          server: loginServer
          identity: pullIdentity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'restaurant-researcher-web'
          image: '${loginServer}/restaurant-researcher-web:${webImageTag}'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            { name: 'API_URL', value: 'https://${backend[0].properties.configuration.ingress.fqdn}' }
            { name: 'AGENT_URL', value: 'https://${backend[1].properties.configuration.ingress.fqdn}' }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
      }
    }
  }
}
