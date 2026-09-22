// Azure Container Apps deployment for the restaurant-researcher-app frontend.
// Frontend-only this phase — no backend Container App exists yet.
//
// Provisions, into the existing rg-chatbot resource group:
//   - a Container Apps environment (no Log Analytics)
//   - a user-assigned managed identity granted AcrPull on the EXISTING registry
//   - the frontend app (ca-restaurant-researcher-web): external ingress
//
// Easy Auth is intentionally NOT here — per-user role assignment can't be
// expressed in Bicep, so it stays in scripts/setup-easyauth.sh +
// scripts/approve-user.sh.
//
// Deploy with infra/deploy.sh.

@description('Region for all resources. Defaults to the resource group location.')
param location string = resourceGroup().location

@description('Existing Azure Container Registry name.')
param acrName string = 'acrchatbotfredheda'

@description('Container Apps environment name.')
param environmentName string = 'cae-restaurant-researcher'

@description('Frontend (Next.js) container app name.')
param frontendAppName string = 'ca-restaurant-researcher-web'

@description('User-assigned managed identity used for ACR pulls.')
param identityName string = 'id-restaurant-researcher-acrpull'

@description('Image tag to deploy (e.g. a git commit SHA).')
param imageTag string

var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'
var loginServer = '${acrName}.azurecr.io'

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
}

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, identity.id, acrPullRoleId)
  scope: acr
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
  }
}

resource environment 'Microsoft.App/managedEnvironments@2025-01-01' = {
  name: environmentName
  location: location
  properties: {}
}

resource frontend 'Microsoft.App/containerApps@2025-01-01' = {
  name: frontendAppName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
  dependsOn: [
    acrPull
  ]
  properties: {
    environmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
      }
      registries: [
        {
          server: loginServer
          identity: identity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'restaurant-researcher-web'
          image: '${loginServer}/restaurant-researcher-web:${imageTag}'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
      }
    }
  }
}

output frontendFqdn string = frontend.properties.configuration.ingress.fqdn
