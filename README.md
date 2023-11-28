<p align="center">
  <img src="assets/testkube-logo.svg" alt="Testkube Logo" width="80"/>
</p>

<p align="center">
  Welcome to Testkube - Your friendly cloud-native testing framework for Kubernetes
</p>

<p align="center">
  <a href="https://testkube.io">Website</a> |
  <a href="https://kubeshop.github.io/testkube">Documentation</a> |
  <a href="https://twitter.com/testkube_io">Twitter</a> |
  <a href="https://discord.gg/hfq44wtR6Q">Discord</a> |
  <a href="https://kubeshop.io/category/testkube">Blog</a>
</p>

<p align="center">
  <img title="MIT license" src="https://img.shields.io/badge/License-MIT-yellow.svg"/>
  <a href="https://github.com/kubeshop/setup-testkube/releases"><img title="Release" src="https://img.shields.io/github/v/release/kubeshop/setup-testkube"/></a>
  <a href="https://github.com/kubeshop/setup-testkube/releases"><img title="Release date" src="https://img.shields.io/github/release-date/kubeshop/setup-testkube"/></a>
</p>

<hr>

# Setup Testkube CLI with GitHub Actions

"Setup Testkube CLI" is a GitHub Action for managing your Testkube installation.

Use it to install Testkube CLI to manage your resources, run tests and test suites, or anything else.

## Table of content

1. [Usage](#usage)
   1. [Testkube Pro](#testkube-pro)
   2. [Self-hosted instance](#self-hosted-instance)
   3. [Examples](#examples)
      1. [Run a test on AWS EKS](#run-a-test-on-aws-eks)
      2. [Run a test on the Cloud instance](#run-a-test-on-the-cloud-instance)
2. [Inputs](#inputs)
   1. [Common](#common)
   2. [Kubernetes (`kubectl`)](#kubernetes-kubectl)
   3. [Cloud and Enterprise](#cloud-and-enterprise-cloud)

## Usage

To use the action in your GitHub workflow, use `kubeshop/setup-testkube@v1` action.
The configuration options are described in the [**Inputs**](#inputs) section, and may vary depending on the Testkube solution you are using ([**Pro**](#pro) or [**self-hosted**](#self-hosted-instance)) and your needs.

### Testkube Pro

To use this GitHub Action for the [**Testkube Pro**](https://app.testkube.io), you need to [**create API token**](https://docs.testkube.io/testkube-pro/organization-management#api-tokens).

Then, pass the `organization` and `environment` IDs for the test, along with the `token` and other parameters specific for your use case:

```yaml
uses: kubeshop/setup-testkube@v1
with:
  # Instance
  organization: tkcorg_0123456789abcdef
  environment: tkcenv_fedcba9876543210
  token: tkcapi_0123456789abcdef0123456789abcd
```

It will be probably unsafe to keep directly in the workflow's YAML configuration, so you may want to use [**Github's secrets**](https://docs.github.com/en/actions/security-guides/encrypted-secrets) instead.

```yaml
uses: kubeshop/setup-testkube@v1
with:
  # Instance
  organization: ${{ secrets.TkOrganization }}
  environment: ${{ secrets.TkEnvironment }}
  token: ${{ secrets.TkToken }}
```

### Self-hosted instance

To connect to the self-hosted instance, you need to have `kubectl` configured for accessing your Kubernetes cluster, and simply passing optional namespace, if the Testkube is not deployed in the default `testkube` namespace, i.e.:

```yaml
uses: kubeshop/setup-testkube@v1
with:
  namespace: custom-testkube
```

### Examples

#### Run a test on AWS EKS

```yaml
steps:
  # Set up Kubectl (AWS EKS)
  - uses: aws-actions/configure-aws-credentials@v4
    with:
      aws-access-key-id: ${{ secrets.AwsAccessKeyId }}
      aws-secret-access-key: ${{ secrets.AwsSecretAccessKey }}
      aws-region: ${{ secrets.AwsRegion }}
  - run: |
      aws eks update-kubeconfig --name ${{ secrets.EksClusterName }} --region ${{ secrets.AwsRegion }}

  # Setup Testkube
  - uses: kubeshop/setup-testkube@v1

  # Use CLI with a shell script
  - run: |
      testkube run test some-test-name -f
```

#### Run a test on the Cloud instance

```yaml
steps:
  # Setup Testkube
  - uses: kubeshop/setup-testkube@v1
    with:
      organization: ${{ secrets.TkOrganization }}
      environment: ${{ secrets.TkEnvironment }}
      token: ${{ secrets.TkToken }}

  # Use CLI with a shell script
  - run: |
      testkube run test some-test-name -f
```

## Inputs

Besides common inputs, there are some different for kubectl and Cloud connection.

### Common

| Required | Name              | Description                                                                                                                  |
|:--------:|-------------------|------------------------------------------------------------------------------------------------------------------------------|
|    ✗     | `channel`         | Distribution channel to install the latest application from - one of `stable` or `beta` (default: `stable`)                  |
|    ✗     | `version`         | Static Testkube CLI version to force its installation instead of the latest                                                  |

### Kubernetes (`kubectl`)

| Required | Name           | Description                                                                            |
|:--------:|----------------|----------------------------------------------------------------------------------------|
|    ✗     | `namespace`    | Set namespace where Testkube is deployed to (default: `testkube`)                      |

### Cloud and Enterprise (`cloud`)

| Required | Name           | Description                                                                                                                                                                                                                               |
|:--------:|----------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|    ✓     | `organization` | The organization ID from Testkube Pro or Enterprise - it starts with `tkc_org`, you may find it i.e. in the dashboard's URL                                                                                                             |
|    ✓     | `environment`  | The environment ID from Testkube Pro or Enterprise - it starts with `tkc_env`, you may find it i.e. in the dashboard's URL                                                                                                              |
|    ✓     | `token`        | API token that has at least a permission to run specific test or test suite. You may read more about [**creating API token**](https://docs.testkube.io/testkube-pro/organization-management#api-tokens) in Testkube Pro or Enterprise |
|    ✗     | `url`          | URL of the Testkube Enterprise instance, if applicable                                                                                                                                                                                    |
